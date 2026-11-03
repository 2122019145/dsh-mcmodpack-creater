#!/usr/bin/env node

/**
 * Test script for the DSH HMCL-MCP plugin.
 */

import { HmclMcpClient } from './lib/mcp-client.js';

async function testPlugin() {
  console.log('Testing DSH HMCL-MCP plugin...');

  const config = {
    jarPath: 'D:/dsh1/mcpackage_genacter/HMCL-MCP/build/hmcl-mcp.jar',
    workdir: 'C:/Users/m2122/.hmcl-mcp',
    javaPath: 'java',
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
    console.log('Environment check result:', JSON.stringify(env, null, 2));

    // Test list_remote_versions
    console.log('\n--- Testing list_remote_versions ---');
    const versions = await client.callTool('list_remote_versions', { type: 'release' });
    console.log('Available versions:', versions.versions?.slice(0, 5) || 'No versions found');

    // Test search_mods
    console.log('\n--- Testing search_mods ---');
    const mods = await client.callTool('search_mods', {
      query: 'storage',
      source: 'modrinth',
      gameVersion: '1.20.1',
      limit: 3
    });
    console.log('Found mods:', mods.mods?.slice(0, 3) || 'No mods found');

    console.log('\n✓ All tests passed!');

  } catch (error) {
    console.error('✗ Test failed:', error.message);
    process.exit(1);
  } finally {
    await client.stop();
  }
}

testPlugin().catch(console.error);