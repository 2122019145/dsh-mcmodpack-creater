#!/usr/bin/env node

/**
 * Demo script showing autonomous modpack building capability.
 */

import { HmclMcpClient } from './lib/mcp-client.js';

async function demoModpackBuild() {
  console.log('🎮 DSH HMCL-MCP Plugin - Autonomous Modpack Building Demo');
  console.log('='.repeat(60));

  const config = {
    jarPath: 'D:/dsh1/mcpackage_genacter/HMCL-MCP/build/hmcl-mcp.jar',
    workdir: 'C:/Users/m2122/.hmcl-mcp',
    javaPath: 'java',
    agentPort: 28501,
    agentToken: 'hmcl-mcp'
  };

  const client = new HmclMcpClient(config);

  try {
    console.log('\n🚀 Starting HMCL-MCP server...');
    await client.start();
    console.log('✅ Server started successfully');

    console.log('\n📋 Checking environment...');
    const env = await client.callTool('check_environment');
    console.log(`📍 Workdir: ${env.workdir}`);
    console.log(`🗄️ Java: ${env.java}`);
    console.log(`📦 HMCL version: ${env.hmclVersion}`);

    console.log('\n🔍 Searching for technology mods...');
    const mods = await client.callTool('search_mods', {
      query: 'technology automation storage',
      source: 'modrinth',
      gameVersion: '1.20.1',
      limit: 5
    });
    
    console.log(`📝 Found ${mods.mods?.length || 0} technology mods:`);
    mods.mods?.forEach((mod, index) => {
      console.log(`  ${index + 1}. ${mod.title} (${mod.id})`);
    });

    console.log('\n🏗️ Simulating autonomous modpack building...');
    console.log('Theme: Technology & Automation');
    console.log('Minecraft Version: 1.20.1');
    console.log('Loader: Fabric');
    
    // Simulate the modpack building process
    const selectedMods = mods.mods?.slice(0, 3) || [];
    console.log('\n📦 Selected mods for installation:');
    selectedMods.forEach((mod, index) => {
      console.log(`  ${index + 1}. ${mod.title}`);
    });

    console.log('\n🎯 Building modpack instance...');
    const instanceName = `tech-demo-${Date.now()}`;
    
    // Install loader first
    console.log('📥 Installing Fabric loader...');
    const loaderVersions = await client.callTool('list_loader_versions', {
      loader: 'fabric',
      gameVersion: '1.20.1'
    });
    
    if (loaderVersions.versions?.length > 0) {
      const loaderVersion = loaderVersions.versions[0];
      await client.callTool('install_loader', {
        loader: 'fabric',
        version_id: loaderVersion.id,
        game_version: '1.20.1',
        name: instanceName
      });
      console.log('✅ Fabric loader installed');
    }

    // Install selected mods
    console.log('\n📥 Installing selected mods...');
    for (const mod of selectedMods) {
      try {
        await client.callTool('install_mod', {
          id: mod.id,
          instance: instanceName,
          source: 'modrinth'
        });
        console.log(`✅ Installed ${mod.title}`);
      } catch (error) {
        console.log(`❌ Failed to install ${mod.title}: ${error.message}`);
      }
    }

    console.log('\n📊 Modpack build summary:');
    console.log(`  🏠 Instance name: ${instanceName}`);
    console.log(`  🎮 Minecraft: 1.20.1`);
    console.log(`  🔧 Loader: Fabric`);
    console.log(`  📦 Mods installed: ${selectedMods.length}`);
    console.log(`  📍 Location: ${config.workdir}/versions/${instanceName}`);

    console.log('\n🎉 Autonomous modpack building demo completed!');
    console.log('The agent can now search, select, and install mods automatically.');

  } catch (error) {
    console.error('❌ Demo failed:', error.message);
    process.exit(1);
  } finally {
    await client.stop();
  }
}

// Run the demo
demoModpackBuild().catch(console.error);