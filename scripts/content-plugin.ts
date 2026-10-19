import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import { loadSiteContent, validateAppStatic } from './content-files';
import { selectProjects } from '../src/domain/select';
import { publicationUrl, sharingCard, sharingHtml, sharingInfo } from './sharing';

export function pagesBase(input = '/') {
  if (
    !/^\/(?:[a-zA-Z0-9._-]+\/)*$/.test(input) ||
    input.split('/').some((part) => part === '.' || part === '..')
  )
    throw new Error('PAGES_BASE는 / 또는 /저장소이름/ 형식이어야 합니다.');
  return input;
}
export function contentRequestPath(url: string, base: string) {
  const path = url.split('?')[0]!;
  return path.startsWith(base) ? path.slice(base.length) : null;
}
export function publicContentPlugin(
  contentRoot = resolve('site-content'),
  staticRoot = resolve('public'),
  siteUrl = process.env.PAGES_URL,
): Plugin {
  let base = '/';
  let published: string | undefined;
  let content: Awaited<ReturnType<typeof loadSiteContent>>;
  return {
    name: 'validated-public-content',
    enforce: 'post',
    async configResolved(config) {
      base = config.base;
      published = publicationUrl(siteUrl, base);
      await validateAppStatic(staticRoot);
      content = await loadSiteContent(contentRoot);
    },
    transformIndexHtml(html, context) {
      const project = selectProjects(content.data).find(
        (project) =>
          context.path === `${base}share/${project.slug}/` ||
          context.path === `${base}share/${project.slug}/index.html`,
      );
      return sharingHtml(html, content.data, base, published, project);
    },
    async configureServer(server) {
      const content = await loadSiteContent(contentRoot);
      const cards = new Map<string, Promise<Buffer>>();
      for (const project of [undefined, ...selectProjects(content.data)]) {
        const path = sharingInfo(content.data, project).image;
        server.middlewares.use((req, res, next) => {
          if (
            contentRequestPath(req.url ?? '', base) !== path ||
            !['GET', 'HEAD'].includes(req.method ?? '')
          )
            return next();
          let card = cards.get(path);
          if (!card) {
            card = sharingCard(content.data, content.files, project);
            cards.set(path, card);
          }
          void card
            .then((bytes) => {
              res.setHeader('Content-Type', 'image/jpeg');
              res.end(req.method === 'HEAD' ? undefined : bytes);
            })
            .catch(next);
        });
      }
      server.middlewares.use((req, res, next) => {
        // configureServer middleware runs before Vite's base middleware.
        const path = contentRequestPath(req.url ?? '', base);
        const bytes = path === null ? undefined : content.files.get(path);
        if (!bytes || !['GET', 'HEAD'].includes(req.method ?? '')) {
          next();
          return;
        }
        res.setHeader(
          'Content-Type',
          path!.endsWith('.json')
            ? 'application/json; charset=utf-8'
            : (content.data.assets.find((asset) => asset.path === path)?.mimeType ??
                'application/octet-stream'),
        );
        res.setHeader('Content-Length', bytes.length);
        res.setHeader('Cache-Control', 'no-store');
        res.end(req.method === 'HEAD' ? undefined : bytes);
      });
    },
    generateBundle: {
      order: 'post',
      async handler(_options, bundle) {
        const content = await loadSiteContent(contentRoot);
        for (const [fileName, source] of content.files) {
          if (bundle[fileName]) throw new Error(`앱 파일과 콘텐츠 경로가 중복됩니다: ${fileName}`);
          this.emitFile({ type: 'asset', fileName, source });
        }
        const entry = bundle['index.html'];
        if (!entry || entry.type !== 'asset')
          throw new Error('공유 페이지의 앱 진입 HTML이 없습니다.');
        const html =
          typeof entry.source === 'string' ? entry.source : new TextDecoder().decode(entry.source);
        for (const project of [undefined, ...selectProjects(content.data)]) {
          const info = sharingInfo(content.data, project);
          this.emitFile({
            type: 'asset',
            fileName: info.image,
            source: await sharingCard(content.data, content.files, project),
          });
          if (project)
            this.emitFile({
              type: 'asset',
              fileName: `${info.page}index.html`,
              source: sharingHtml(html, content.data, base, published, project),
            });
        }
        console.log(`Pages 콘텐츠: 작품 ${content.data.projects.length}개, 경로 ${base}`);
      },
    },
  };
}
