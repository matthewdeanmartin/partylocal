let enabled = false;
export function enableFeatureStyles(): void { enabled = true; }

/** Load scoped styles when their view is opened; retain them for return visits. */
export function loadFeatureStyle(name: string): void {
  if (!enabled) return; // Shared forms in other apps use their own global styles.
  const id = `party-style-${name}`;
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id; link.rel = 'stylesheet';
  link.href = new URL(`features/${name}.css`, document.baseURI).href;
  document.head.append(link);
}
