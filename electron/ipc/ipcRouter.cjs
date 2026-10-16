/**
 * IPC Router Façade
 * Modularized architecture routing Electron IPC events to dedicated domain handlers.
 */
const { registerProfileStorageHandlers } = require("./handlers/profileStorageHandlers.cjs");
const { registerP2PServerHandlers } = require("./handlers/p2pServerHandlers.cjs");
const { registerChatHandlers } = require("./handlers/chatHandlers.cjs");
const { registerMediaFileHandlers } = require("./handlers/mediaFileHandlers.cjs");
const { registerSystemDiagHandlers } = require("./handlers/systemDiagHandlers.cjs");
const { registerPluginDriveHandlers } = require("./handlers/pluginDriveHandlers.cjs");

/**
 * Registers all Inter-Process Communication (IPC) invocation handlers and event listeners.
 * Bridges frontend React renderer calls to background P2P room operations, storage,
 * media scanning, and system services.
 * 
 * @returns {void}
 */
function registerIPCHandlers() {
  registerProfileStorageHandlers();
  registerP2PServerHandlers();
  registerChatHandlers();
  registerMediaFileHandlers();
  registerSystemDiagHandlers();
  registerPluginDriveHandlers();
}

module.exports = { registerIPCHandlers };
