#!/usr/bin/env node

/**
 * Minimal test script for the HMCL-MCP client without DSH tool registration.
 */

import { HmclMcpClient } from './lib/mcp-client.js';

async function testMinimal() {
  console.log('Testing HMCL-MCP client (minimal)...');

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