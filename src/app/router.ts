export type Route =
  | { name: 'gallery' | 'exhibition' }
  | { name: 'project' | 'architecture'; slug: string }
  | {
      name: 'studio';
      screen: 'profile' | 'projects' | 'presentation' | 'export';
      projectId?: string;
    }
  | { name: 'not-found' };

const identifier = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const validId = (id: string) => id.length <= 64 && identifier.test(id);

export function parseRoute(hash: string, defaultView: 'gallery' | 'exhibition' = 'gallery'): Route {
  if (!hash || hash === '#' || hash === '#/') return { name: defaultView };
  let path: string;
  try {
    path = decodeURIComponent(hash.replace(/^#/, '')).replace(/\/$/, '');
  } catch {
    return { name: 'not-found' };
  }
  if (path === '/gallery') return { name: 'gallery' };
  if (path === '/exhibition') return { name: 'exhibition' };
  if (path === '/studio') return { name: 'studio', screen: 'profile' };
  const parts = path.split('/');
  if (parts[1] === 'projects' && parts[2] && validId(parts[2])) {
    if (parts.length === 3) return { name: 'project', slug: parts[2] };
    if (parts.length === 4 && parts[3] === 'architecture')
      return { name: 'architecture', slug: parts[2] };
  }
  if (parts[1] === 'studio') {
    if (parts.length === 4 && parts[2] === 'projects' && parts[3] && validId(parts[3]))
      return { name: 'studio', screen: 'projects', projectId: parts[3] };
    if (
      parts.length === 3 &&
      ['profile', 'projects', 'presentation', 'export'].includes(parts[2] ?? '')
    ) {
      return {
        name: 'studio',
        screen: parts[2] as 'profile' | 'projects' | 'presentation' | 'export',
      };
    }
  }
  return { name: 'not-found' };
}

export function routeHash(route: Route): string {
  switch (route.name) {
    case 'gallery':
    case 'exhibition':
      return `#/${route.name}`;
    case 'project':
      return `#/projects/${route.slug}`;
    case 'architecture':
      return `#/projects/${route.slug}/architecture`;
    case 'studio':
      return `#/studio/${route.screen}${route.projectId ? `/${route.projectId}` : ''}`;
    case 'not-found':
      return '#/not-found';
  }
}
