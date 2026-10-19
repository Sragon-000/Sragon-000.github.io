import type { Portfolio, ViewMode } from './types';

export function selectProjects(data: Portfolio, mode: ViewMode = 'public') {
  const projects = new Map(data.projects.map((project) => [project.id, project]));
  return data.site.exhibition.projectOrder.flatMap((id) => {
    const project = projects.get(id);
    return project && (mode === 'workspace' || project.status === 'published') ? [project] : [];
  });
}

// ID and slug are separate namespaces: use the corresponding lookup deliberately.
export function selectProject(
  data: Portfolio,
  key: string,
  by: 'id' | 'slug' = 'slug',
  mode: ViewMode = 'public',
) {
  return selectProjects(data, mode).find((project) => project[by] === key);
}

export function selectArchitecture(data: Portfolio, projectId: string, mode: ViewMode = 'public') {
  if (!selectProject(data, projectId, 'id', mode)) return undefined;
  return data.architectures.find(
    (graph) => graph.projectId === projectId && (mode === 'workspace' || graph.verified),
  );
}
