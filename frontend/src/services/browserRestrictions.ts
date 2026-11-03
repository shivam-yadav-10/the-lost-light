/** Identifies page-level inspection shortcuts; browser menus remain outside the page's control. */
export function isInspectionShortcut(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'shiftKey' | 'metaKey' | 'altKey'>): boolean {
  const key = event.key.toLowerCase();
  return key === 'f12'
    || (event.ctrlKey && event.shiftKey && ['i', 'j', 'c'].includes(key))
    || (event.metaKey && event.altKey && ['i', 'j', 'c'].includes(key))
    || ((event.ctrlKey || event.metaKey) && key === 'u');
}

/** Installs a best-effort page deterrent and returns listener cleanup. */
export function restrictInspection(target: Document): () => void {
  const preventContextMenu = (event: Event) => event.preventDefault();
  const preventShortcut = (event: KeyboardEvent) => {
    if (isInspectionShortcut(event)) event.preventDefault();
  };
  target.addEventListener('contextmenu', preventContextMenu);
  target.addEventListener('keydown', preventShortcut, true);
  return () => {
    target.removeEventListener('contextmenu', preventContextMenu);
    target.removeEventListener('keydown', preventShortcut, true);
  };
}
