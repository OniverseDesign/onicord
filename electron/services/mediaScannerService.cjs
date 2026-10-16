const { desktopCapturer } = require("electron");

class MediaScannerService {
  async getSources() {
    const sources = await desktopCapturer.getSources({
      types: ["screen", "window"],
      thumbnailSize: { width: 150, height: 150 },
      fetchWindowIcons: true,
    });
    return sources.map((source) => ({
      id: source.id,
      name: source.name,
      thumbnail: source.thumbnail.toDataURL(),
      hasAudio: !!source.display_id,
    }));
  }
}

module.exports = new MediaScannerService();
