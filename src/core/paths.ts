/** Normalize path separators and remove harmless `.` components. */
export function normalizeProjectPath(path: string): string {
  const parts: string[] = [];
  for (const part of path.replaceAll('\\', '/').split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') throw new Error(`Project path escapes its root: ${path}`);
    parts.push(part);
  }
  return parts.join('/');
}

export function joinProjectPaths(...segments: readonly string[]): string {
  return normalizeProjectPath(segments.filter(Boolean).join('/'));
}

/** Resolve from the directory containing `fromPath`; absolute-like paths are project-root relative. */
export function resolveProjectPath(fromPath: string, reference: string): string {
  const normalizedReference = reference.replaceAll('\\', '/');
  if (normalizedReference.startsWith('/')) return normalizeProjectPath(normalizedReference);
  const base = normalizeProjectPath(fromPath).split('/').filter(Boolean);
  base.pop();
  for (const part of normalizedReference.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (base.length === 0) throw new Error(`Project path escapes its root: ${reference}`);
      base.pop();
    } else {
      base.push(part);
    }
  }
  return base.join('/');
}

export function projectPathBasename(path: string): string {
  const normalized = normalizeProjectPath(path);
  return normalized.slice(normalized.lastIndexOf('/') + 1);
}

export function projectPathDirname(path: string): string {
  const normalized = normalizeProjectPath(path);
  const slash = normalized.lastIndexOf('/');
  return slash < 0 ? '' : normalized.slice(0, slash);
}

export function projectPathWithoutExtension(path: string): string {
  const basename = projectPathBasename(path);
  const dot = basename.lastIndexOf('.');
  return dot <= 0 ? basename : basename.slice(0, dot);
}
