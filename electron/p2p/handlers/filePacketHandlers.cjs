"use strict";

/**
 * P2P File streaming, parallel block transfer, and sticker exchange packet handler.
 * Dispatches: 'file-request-port', 'file-seeder-offer', 'file-request-block',
 *             'file-response-chunk', 'file-response-error', 'file-cancel-transfer',
 *             'sticker-request', 'sticker-response'.
 */
async function handleFilePacket(roomManager, peerId, type, payload) {
  if (type === "file-request-port" && payload) {
    roomManager.fileService.handleFileRequestPort(peerId, payload);
    return true;
  }

  if (type === "file-seeder-offer" && payload) {
    roomManager.fileService.handleFileSeederOffer(peerId, payload);
    return true;
  }

  if (type === "file-request-block" && payload) {
    roomManager.fileService.handleFileRequestBlock(peerId, payload);
    return true;
  }

  if (type === "file-response-chunk" && payload) {
    roomManager.fileService.handleFileResponseChunk(peerId, payload);
    return true;
  }

  if (type === "file-response-error" && payload) {
    roomManager.fileService.handleFileResponseError(peerId, payload);
    return true;
  }

  if (type === "file-cancel-transfer" && payload) {
    roomManager.fileService.handleFileCancelTransfer(peerId, payload);
    return true;
  }

  if (type === "sticker-request" && payload) {
    roomManager.chatService.handleStickerRequest(peerId, payload);
    return true;
  }

  if (type === "sticker-response" && payload) {
    roomManager.chatService.handleStickerResponse(payload);
    return true;
  }

  return false;
}

module.exports = { handleFilePacket };
