export type Id = string;
export interface Link {
  label: string;
  url: string;
}
export interface Site {
  profile: {
    displayName: string;
    bio: string;
    avatarAssetId: Id | null;
    interests: string[];
    links: Link[];
  };
  exhibition: {
    title: string;
    description: string;
    defaultView: 'gallery' | 'exhibition';
    projectOrder: Id[];
  };
  theme: { preset: 'digital' | 'light'; logoAssetId: Id | null; faviconAssetId: Id | null };
}
export interface CaseStudy {
  id: Id;
  title: string;
  problem: string;
  alternatives: string[];
  solution: string;
  outcome: string;
  evidence: Link[];
}
export interface Project {
  id: Id;
  slug: string;
  title: string;
  summary: string;
  genre: string | null;
  status: 'draft' | 'published';
  role: string | null;
  period: { start: string | null; end: string | null; ongoing: boolean };
  platforms: string[];
  technologies: string[];
  teamSize: number | null;
  media: {
    coverAssetId: Id | null;
    screenshotAssetIds: Id[];
    video: { provider: 'youtube'; videoId: string; title: string } | null;
  };
  contribution: { responsibilities: string[]; leadership: string[] };
  overview: string;
  caseStudies: CaseStudy[];
  outcome: string;
  reflection: string;
  links: Link[];
}
export interface GraphNode {
  id: Id;
  label: string;
  groupId: Id | null;
  parentId: Id | null;
  responsibility: string;
  inputs: string[];
  outputs: string[];
  decisions: string;
  contributionType: 'direct' | 'shared' | 'team' | 'unknown';
  contributionNote: string;
  relatedCaseIds: Id[];
  codeRefs: Link[];
}
export interface Architecture {
  projectId: Id;
  verified: boolean;
  revision: {
    label: string | null;
    reviewedAt: string | null;
    sources: {
      kind: 'code' | 'document' | 'author';
      label: string;
      url: string | null;
      note: string;
    }[];
  };
  groups: { id: Id; label: string; layer: number }[];
  nodes: GraphNode[];
  edges: {
    id: Id;
    source: Id;
    target: Id;
    type: 'call' | 'data' | 'event' | 'dependency';
    label: string;
    description: string;
  }[];
}
export interface Asset {
  id: Id;
  path: string;
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/avif';
  byteSize: number;
  width: number;
  height: number;
  alt: string;
}
export interface Portfolio {
  schemaVersion: '1.0.0';
  kind: 'workspace' | 'public' | 'example';
  site: Site;
  projects: Project[];
  architectures: Architecture[];
  assets: Asset[];
}
export type PublicPortfolio = Portfolio & { kind: 'public' };
export type ViewMode = 'public' | 'workspace';
export interface Issue {
  code: string;
  severity: 'error' | 'notice';
  path: string;
  message: string;
  target?: { projectId?: Id; entityId?: Id; assetId?: Id };
}
export type ValidationResult =
  { valid: true; data: Portfolio; issues: Issue[] } | { valid: false; issues: Issue[] };

export interface PendingInput {
  scope: 'site' | 'project' | 'graph' | 'group' | 'node' | 'edge';
  projectId: string | null;
  entityId: string | null;
  path: string;
  rawValue: string;
}
