import type { Portfolio, Project } from './types';

export function createWorkspace(): Portfolio & { kind: 'workspace' } {
  return {
    schemaVersion: '1.0.0',
    kind: 'workspace',
    site: {
      profile: { displayName: '', bio: '', avatarAssetId: null, interests: [], links: [] },
      exhibition: { title: '', description: '', defaultView: 'gallery', projectOrder: [] },
      theme: { preset: 'light', logoAssetId: null, faviconAssetId: null },
    },
    projects: [],
    architectures: [],
    assets: [],
  };
}

// IDs do not depend on a title; callers append the new project ID to projectOrder.
export function createProject(existing: readonly Project[] = []): Project {
  const occupied = new Set(existing.flatMap((project) => [project.id, project.slug]));
  let id: string;
  do {
    id = `project-${crypto.randomUUID()}`;
  } while (occupied.has(id));
  return {
    id,
    slug: id,
    title: '',
    summary: '',
    genre: null,
    status: 'draft',
    role: null,
    period: { start: null, end: null, ongoing: false },
    platforms: [],
    technologies: [],
    teamSize: null,
    media: { coverAssetId: null, screenshotAssetIds: [], video: null },
    contribution: { responsibilities: [], leadership: [] },
    overview: '',
    caseStudies: [],
    outcome: '',
    reflection: '',
    links: [],
  };
}
