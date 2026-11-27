export const GlobalWorkerOptions = { workerSrc: "" };
export class TextLayer {
  render() { return Promise.resolve(); }
  cancel() {}
}
export function getDocument() {
  return { promise: Promise.reject(new Error("Disabled in demo")) };
}
export class Hls {
  static isSupported() { return false; }
  on() {}
  loadSource() {}
  attachMedia() {}
  destroy() {}
}
export default Hls;
