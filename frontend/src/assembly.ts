/* Assembly mount point. Day 4: placeholder. Day 5: Three.js viewer. */

export interface AssemblyHandle {
  select(id: string): void;
}

export function initAssembly(el: HTMLElement): AssemblyHandle {
  const box = document.createElement('div');
  box.className = 'placeholder';
  box.textContent = '3D assembly arrives next: exploded bearing view with suspect highlight.';
  el.appendChild(box);
  return {
    select(_id: string): void {
      /* Day 5 wires this to the 3D highlight. */
    },
  };
}

export const COMPONENTS = [
  'motor',
  'shaft',
  'housing',
  'ring_inner',
  'ring_outer',
  'rollers',
  'cage',
];
