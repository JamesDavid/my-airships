// Browser furniture the world and the ship reach for while being built:
// a 2-D canvas for the instrument faces and the ground texture, and a clock.
// Import this BEFORE anything from src/.
const ctx2d = () => new Proxy({}, {
  get: (t, k) => (k === 'canvas' ? { width: 0, height: 0 }
    : k === 'measureText' ? () => ({ width: 0 })
    : k === 'createLinearGradient' || k === 'createRadialGradient'
      ? () => ({ addColorStop() {} })
    : k === 'getImageData' ? (x, y, w, h) => ({ width: w || 1, height: h || 1,
        data: new Uint8ClampedArray(4 * (w || 1) * (h || 1)) })
    : k === 'createImageData' ? (w, h) => ({ width: w || 1, height: h || 1,
        data: new Uint8ClampedArray(4 * (w || 1) * (h || 1)) })
    : () => {}),
  set: () => true,
});
globalThis.document = globalThis.document || {
  createElement: () => ({ width: 0, height: 0, getContext: ctx2d, style: {} }),
  addEventListener() {}, querySelector: () => null, querySelectorAll: () => [],
  body: { appendChild() {}, style: {} }, hidden: false,
};
globalThis.window = globalThis.window || {
  innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
  addEventListener() {}, removeEventListener() {},
  requestAnimationFrame: () => 0, matchMedia: () => ({ matches: false }),
};
globalThis.performance = globalThis.performance || { now: () => 0 };
globalThis.localStorage = globalThis.localStorage || {
  getItem: () => null, setItem() {}, removeItem() {},
};

// bare globals the world reads without the window. prefix
globalThis.matchMedia = globalThis.matchMedia || (() => ({ matches: false,
  addEventListener() {}, removeEventListener() {} }));
globalThis.innerWidth = 1280;
globalThis.innerHeight = 720;
globalThis.devicePixelRatio = 1;
globalThis.requestAnimationFrame = globalThis.requestAnimationFrame || (() => 0);
