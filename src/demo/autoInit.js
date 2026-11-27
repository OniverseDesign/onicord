import { initDemoBridge } from './demoBridge';

if (
  import.meta.env.VITE_DEMO === 'true' ||
  (typeof window !== 'undefined' && !window.electronAPI && new URLSearchParams(window.location.search).has('demo'))
) {
  initDemoBridge();
}
