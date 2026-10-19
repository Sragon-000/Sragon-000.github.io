import sharp, { type OverlayOptions } from 'sharp';
import type { Portfolio, Project } from '../src/domain/types';
import { selectProjects } from '../src/domain/select';
import { MAX_IMAGE_PIXELS } from '../src/packages/policy';
import { scenePalette } from '../src/three/palette';

export const SHARE_IMAGE_WIDTH = 1200;
export const SHARE_IMAGE_HEIGHT = 630;
export const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
const compact = (value: string, max: number) =>
  Array.from(
    value
      .replace(/\p{Cc}/gu, ' ')
      .replace(/\s+/gu, ' ')
      .trim(),
  )
    .slice(0, max)
    .join('');
export function publicationUrl(input: string | undefined, base: string): string | undefined {
  if (!input) return undefined;
  const url = new URL(input);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    /[\s\\]/u.test(input)
  )
    throw new Error('PAGES_URL은 인증정보·쿼리·해시가 없는 HTTPS 배포 주소여야 합니다.');
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  if (url.pathname !== base) throw new Error('PAGES_URL 경로와 PAGES_BASE가 다릅니다.');
  return url.href;
}
export function sharingInfo(data: Portfolio, project?: Project) {
  const site = compact(data.site.exhibition.title, 120) || '프로젝트 전시장';
  const owner = compact(data.site.profile.displayName, 120) || '제작자';
  return {
    site,
    owner,
    title: project ? `${compact(project.title, 120)} · ${site}` : `${site} · ${owner}`,
    description: compact(
      project?.summary ||
        data.site.exhibition.description ||
        data.site.profile.bio ||
        `${owner}의 게임과 기술, 제작 경험을 담은 프로젝트 전시장.`,
      200,
    ),
    image: project ? `share/${project.slug}/card.jpg` : 'share/site-card.jpg',
    page: project ? `share/${project.slug}/` : '',
    route: project ? `#/projects/${project.slug}` : '#/gallery',
    cover:
      project?.media.coverAssetId ?? data.site.theme.logoAssetId ?? data.site.profile.avatarAssetId,
  };
}
export function sharingTags(data: Portfolio, base: string, published?: string, project?: Project) {
  const info = sharingInfo(data, project);
  const image = published ? new URL(info.image, published).href : `${base}${info.image}`;
  const meta = (key: string, value: string, attribute = 'property') =>
    `<meta ${attribute}="${key}" content="${escapeHtml(value)}" data-io-share />`;
  return [
    `<title>${escapeHtml(info.title)}</title>`,
    meta('description', info.description, 'name'),
    meta('og:type', 'website'),
    meta('og:locale', 'ko_KR'),
    meta('og:site_name', info.site),
    meta('og:title', info.title),
    meta('og:description', info.description),
    meta('og:image', image),
    meta('og:image:type', 'image/jpeg'),
    meta('og:image:width', String(SHARE_IMAGE_WIDTH)),
    meta('og:image:height', String(SHARE_IMAGE_HEIGHT)),
    meta('og:image:alt', `${project?.title || info.site} · ${info.owner}의 전시 공유 카드`),
    meta('twitter:card', 'summary_large_image', 'name'),
    meta('twitter:title', info.title, 'name'),
    meta('twitter:description', info.description, 'name'),
    meta('twitter:image', image, 'name'),
    ...(published
      ? [
          meta('og:url', new URL(info.page, published).href),
          `<link rel="canonical" href="${escapeHtml(new URL(info.page, published).href)}" data-io-share />`,
        ]
      : []),
  ].join('\n    ');
}
export function sharingHtml(
  html: string,
  data: Portfolio,
  base: string,
  published?: string,
  project?: Project,
) {
  const info = sharingInfo(data, project);
  // Vite's final app scripts are retained; only sharing metadata and initial app destination vary.
  return html
    .replace(/<title>[\s\S]*?<\/title>/u, '')
    .replace(/<(?:meta|link)\b[^>]*\bdata-io-share\s*[^>]*>/gu, '')
    .replace(/<noscript data-io-share>[\s\S]*?<\/noscript>/gu, '')
    .replace('</head>', `${sharingTags(data, base, published, project)}\n  </head>`)
    .replace(
      /<div id="root"[^>]*><\/div>/u,
      `<div id="root"${project ? ` data-initial-route="${escapeHtml(info.route)}"` : ''}></div>`,
    )
    .replace(
      '</body>',
      `<noscript data-io-share><h1>${escapeHtml(info.title)}</h1><p>${escapeHtml(info.description)}</p><a href="${base}${info.route}">전시장 열기</a></noscript>\n  </body>`,
    );
}
export function sharingPaths(data: Portfolio) {
  return new Set([
    'share/site-card.jpg',
    ...selectProjects(data).flatMap((project) => [
      `share/${project.slug}/index.html`,
      `share/${project.slug}/card.jpg`,
    ]),
  ]);
}
function lines(value: string, width: number, count: number) {
  const result: string[] = [];
  let current = '';
  let units = 0;
  for (const char of compact(value, 240)) {
    const size = char.codePointAt(0)! > 255 ? 2 : 1;
    if (units + size > width) {
      result.push(current);
      current = '';
      units = 0;
    }
    if (result.length === count) {
      result[count - 1] = result[count - 1]!.slice(0, -1) + '…';
      return result;
    }
    current += char;
    units += size;
  }
  if (current) result.push(current);
  return result;
}
export async function sharingCard(
  data: Portfolio,
  files: ReadonlyMap<string, Uint8Array>,
  project?: Project,
) {
  const info = sharingInfo(data, project);
  const asset = data.assets.find((asset) => asset.id === info.cover);
  const cover = asset ? files.get(asset.path) : undefined;
  const x = cover ? 610 : 80;
  const title = lines(project?.title || info.site, cover ? 22 : 44, 3);
  const owner = lines(info.owner, cover ? 32 : 64, 1)[0] || '제작자';
  const palette = scenePalette(data.site.theme.preset);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <rect width="1200" height="630" fill="${palette.background}"/>
  <rect x="${x}" y="94" width="52" height="5" fill="${palette.accent}"/>
  <g font-family="Noto Sans CJK KR, Apple SD Gothic Neo, sans-serif" fill="${palette.accent}"><text x="${x}" y="145" font-size="20" letter-spacing="3">PROJECT EXHIBITION</text></g>
  <g font-family="Noto Sans CJK KR, Apple SD Gothic Neo, sans-serif" fill="${palette.text}" font-size="48" font-weight="bold">${title.map((line, i) => `<text x="${x}" y="${245 + i * 66}">${escapeHtml(line)}</text>`).join('')}</g>
  <text x="${x}" y="510" font-family="Noto Sans CJK KR, Apple SD Gothic Neo, sans-serif" fill="${palette.muted}" font-size="28">${escapeHtml(owner)}</text>
  <text x="${x}" y="563" font-family="Noto Sans CJK KR, Apple SD Gothic Neo, sans-serif" fill="${palette.accent}" font-size="20">게임 · 기술 · 제작 경험</text></svg>`;
  const overlays: OverlayOptions[] = [];
  if (cover)
    overlays.push({
      input: await sharp(cover, { limitInputPixels: MAX_IMAGE_PIXELS })
        .autoOrient()
        .resize(540, 630, { fit: 'cover' })
        .flatten({ background: palette.background })
        .jpeg()
        .toBuffer(),
      left: 0,
      top: 0,
    });
  // Text layer comes last, with the left image space transparent when a cover exists.
  const textSvg = cover
    ? svg.replace(
        `<rect width="1200" height="630" fill="${palette.background}"/>`,
        `<rect x="540" width="660" height="630" fill="${palette.background}"/>`,
      )
    : svg;
  overlays.push({ input: Buffer.from(textSvg), left: 0, top: 0 });
  return sharp({
    create: { width: 1200, height: 630, channels: 3, background: palette.background },
  })
    .composite(overlays)
    .jpeg({ quality: 85 })
    .toBuffer();
}
