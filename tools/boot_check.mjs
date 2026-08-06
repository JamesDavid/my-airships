// Boot main.js the way a browser would, with a DOM stubbed under it, and see
// whether it gets to the end. It exists because the VR wiring put
// `vr.initVR(renderer, camera, ...)` four lines ABOVE `const camera = ...` and
// that is a temporal dead zone: a blank page on every device, everywhere, and
// nothing else in this repo would have caught it. `node --check` only parses.
//
// Use: node tools/boot_check.mjs
import './headless.mjs';
// a DOM stub good enough to let main.js build itself
const els = new Map();
const mkEl = (id) => ({ id, textContent: '', innerHTML: '', value: '', checked: false,
  style: {}, dataset: {}, children: [], classList: { add(){}, remove(){}, toggle(){}, contains(){return false;} },
  addEventListener(){}, removeEventListener(){}, appendChild(c){ this.children.push(c); },
  removeChild(){}, remove(){}, querySelector: () => mkEl('q'), querySelectorAll: () => [],
  getContext: () => new Proxy({}, { get: (t,k) => (k==='canvas'?{width:1,height:1}
    : k==='measureText'? () => ({width:0})
    : k==='createLinearGradient'||k==='createRadialGradient'? () => ({addColorStop(){}})
    : k==='getImageData'? (x,y,w,h)=>({width:w||1,height:h||1,data:new Uint8ClampedArray(4*(w||1)*(h||1))})
    : () => {}), set: () => true }),
  get firstChild(){ return this.children[0]; },
  get lastElementChild(){ return this.children[this.children.length-1]; },
  set width(v){}, set height(v){}, focus(){}, blur(){}, click(){}, insertBefore(){}, setAttribute(){}, getAttribute(){return null;} });
globalThis.document = {
  getElementById: (id) => { if (!els.has(id)) els.set(id, mkEl(id)); return els.get(id); },
  createElement: (t) => mkEl(t), createElementNS: (n,t) => mkEl(t),
  querySelector: () => mkEl('q'), querySelectorAll: () => [],
  addEventListener(){}, removeEventListener(){}, hidden: false,
  body: mkEl('body'), documentElement: mkEl('html'), head: mkEl('head'),
};
globalThis.addEventListener = () => {}; globalThis.removeEventListener = () => {};
globalThis.location = { search: '', href: 'https://myairships.com/', hash: '' };
globalThis.history = { replaceState(){} };
globalThis.fetch = () => Promise.reject(new Error('offline'));

globalThis.AudioContext = function(){ return { createGain: () => ({ connect(){}, gain:{value:0,setTargetAtTime(){}} }),
  createOscillator: () => ({ connect(){}, start(){}, stop(){}, frequency:{value:0,setTargetAtTime(){}}, type:'' }),
  createBufferSource: () => ({ connect(){}, start(){}, stop(){} }),
  createBuffer: () => ({ getChannelData: () => new Float32Array(16) }),
  destination:{}, currentTime:0, state:'running', resume(){} }; };
try { await import('../src/main.js'); console.log('main.js BOOTED with VR wired in'); }
catch (e) { console.log('BOOT FAILED:', e.constructor.name + ': ' + e.message);
  console.log((e.stack||'').split('\n').slice(1,4).join('\n')); }
