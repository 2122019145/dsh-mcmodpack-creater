#!/usr/bin/env node

/**
 * Minimal test script for the HMCL-MCP client without DSH tool registration.
 */

import path from 'node:path';
import { HmclMcpClient } from './lib/mcp-client.js';
import { PLUGIN_ROOT } from './lib/paths.js';

// Portable defaults: the jar lives next to package.json unless overridden.
const jarPath = process.env.HMCL_MCP_JAR || path.join(PLUGIN_ROOT, 'hmcl-mcp.jar');
const workdir = process.env.HMCL_MCP_WORKDIR || '~/.hmcl-mcp';

async function testMinimal() {
  console.log('Testing HMCL-MCP client (minimal)...');

  const config = {
    jarPath,
    workdir,
    javaPath: process.env.HMCL_MCP_JAVA || 'java',
    agentPort: 28501,
    agentToken: 'hmcl-mcp'
  };

  const client = new HmclMcpClient(config);

  try {
    // Start the client
    await client.start();
    console.log('✓ MCP client started successfully');

    // Test check_environment
    console.log('\n--- Testing check_environment ---');
    const env = await client.callTool('check_environment');
    console.log('Environment check completed');

    // Test list_remote_versions
    console.log('\n--- Testing list_remote_versions ---');
    const versions = await client.callTool('list_remote_versions', { type: 'release' });
    console.log(`Found ${versions.versions?.length || 0} versions`);

    console.log('\n✓ All tests passed!');

  } catch (error) {
    console.error('✗ Test failed:', error.message);
    process.exit(1);
  } finally {
    await client.stop();
  }
}

testMinimal().catch(console.error);