import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import type { ValidateFunction } from 'ajv';
import portfolioSchema from '../spec/schemas/portfolio.schema.json' with { type: 'json' };
import manifestSchema from '../spec/schemas/export-manifest.schema.json' with { type: 'json' };
import backupSchema from '../spec/schemas/backup.schema.json' with { type: 'json' };
import portfolioCheck from '../src/domain/schema-validator';
import manifestCheck from '../src/packages/manifest-validator';
import backupCheck from '../src/packages/backup-validator';
import { standaloneValidator } from '../scripts/validation-plugin';
import { initialBundle, enforceBudget } from '../scripts/check-performance';
import {
  publicationUrl,
  sharingHtml,
  sharingInfo,
  sharingPaths,
  sharingCard,
} from '../scripts/sharing';
import { createWorkspace } from '../src/domain/create';
import { emptyMetadata } from '../src/packages/types';
import { fixture, publicGraph } from './fixtures';
import sharp from 'sharp';

const require = createRequire(import.meta.url);
test('브라우저의 사전 생성 검증은 원본 스키마의 결과와 오류를 유지한다', async () => {
  const root = await mkdtemp(join(tmpdir(), 'io-validators-'));
  try {
    const checks: [object, ValidateFunction, unknown[]][] = [
      [
        portfolioSchema,
        portfolioCheck,
        [
          createWorkspace(),
          fixture('owner'),
          publicGraph(),
          {},
          { ...createWorkspace(), schemaVersion: '2.0.0' },
          { ...createWorkspace(), unknown: true },
        ],
      ],
      [
        manifestSchema,
        manifestCheck,
        [
          {
            exportVersion: '1.0.0',
            schemaVersion: '1.0.0',
            kind: 'public-content',
            createdAt: '2026-10-10T00:00:00Z',
            files: [],
          },
          {},
          { createdAt: 'not-a-date' },
        ],
      ],
      [
        backupSchema,
        backupCheck,
        [
          emptyMetadata(),
          { ...emptyMetadata(), savedAt: 'not-a-date' },
          { ...emptyMetadata(), pendingInputs: [{}] },
        ],
      ],
    ];
    const invalid = fixture('owner');
    invalid.projects[0]!.teamSize = 1.5;
    invalid.site.profile.links = [{ label: 'invalid', url: 'bad' }];
    checks[0]![2].push(invalid);
    for (const [index, [schema, original, inputs]] of checks.entries()) {
      const code = standaloneValidator(schema).replace(
        /from '([^']+)'/gu,
        (_match, path: string) => `from '${pathToFileURL(require.resolve(path)).href}'`,
      );
      const path = join(root, `${index}.mjs`);
      await writeFile(path, code);
      const generated = (await import(pathToFileURL(path).href)).default as ValidateFunction;
      for (const input of inputs) {
        assert.equal(generated(structuredClone(input)), original(structuredClone(input)));
        assert.deepEqual(generated.errors, original.errors);
      }
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('배포 주소는 root·subpath·custom domain에 맞고 잘못된 주소를 거부한다', () => {
  assert.equal(publicationUrl('https://owner.github.io', '/'), 'https://owner.github.io/');
  assert.equal(
    publicationUrl('https://owner.github.io/portfolio', '/portfolio/'),
    'https://owner.github.io/portfolio/',
  );
  assert.equal(publicationUrl('https://portfolio.example/', '/'), 'https://portfolio.example/');
  assert.equal(publicationUrl(undefined, '/'), undefined);
  for (const url of [
    'http://example.com/',
    'https://user:password@example.com/',
    'https://example.com/?q=1',
    'https://example.com/#/gallery',
    'https://example.com/wrong/',
  ])
    assert.throws(() => publicationUrl(url, '/'));
});
test('공유 HTML은 특수문자를 이스케이프하고 공개 작품만 별도 주소로 내보낸다', () => {
  const data = fixture('owner');
  data.site.profile.displayName = '<script>alert("x")</script>';
  data.site.exhibition.description = 'a & "b"';
  const project = data.projects[0]!;
  project.status = 'published';
  project.title = '게임 <test>';
  project.summary = '공유 요약';
  const html = sharingHtml(
    '<head><title>old</title></head><body><div id="root"></div></body>',
    data,
    '/portfolio/',
    'https://owner.github.io/portfolio/',
    project,
  );
  assert.ok(html.includes('content="게임 &lt;test&gt;'));
  assert.ok(html.includes('https://owner.github.io/portfolio/share/'));
  assert.ok(html.includes(`data-initial-route="#/projects/${project.slug}"`));
  assert.ok(html.includes('content="공유 요약"'));
  assert.ok(!html.includes('<script>alert'));
  assert.ok(![...sharingPaths(data)].some((path) => path.includes(data.projects[1]!.slug)));
  const twice = sharingHtml(html, data, '/portfolio/', undefined, project);
  assert.equal((twice.match(/<noscript /gu) ?? []).length, 1);
  assert.equal((twice.match(/property="og:title"/gu) ?? []).length, 1);
  assert.ok(!twice.includes('rel="canonical"'));
  assert.ok(sharingInfo(createWorkspace()).description.includes('제작자'));
});
test('공유 카드는 대표 이미지가 없어도 실제 JPEG 1200×630으로 생성된다', async () => {
  const bytes = await sharingCard(createWorkspace(), new Map());
  const image = await sharp(bytes).metadata();
  assert.equal(image.format, 'jpeg');
  assert.equal(image.width, 1200);
  assert.equal(image.height, 630);
});
test('초기 JS 측정은 공통 정적 import까지 합산하고 지연 import를 제외한다', async () => {
  const root = await mkdtemp(join(tmpdir(), 'io-bundle-'));
  try {
    await mkdir(join(root, 'assets'));
    await writeFile(
      join(root, 'index.html'),
      '<script type="module" src="/portfolio/assets/app.js"></script>',
    );
    const app = 'import{a}from"./shared.js";import("./lazy.js");';
    await writeFile(join(root, 'assets/app.js'), app);
    await writeFile(join(root, 'assets/shared.js'), 'import"./other.js";export const a=1;');
    await writeFile(join(root, 'assets/other.js'), 'export {};');
    const report = await initialBundle(root, '/portfolio/');
    assert.equal(report.files.length, 3);
    assert.ok(!report.files.some((file) => file.path.endsWith('lazy.js')));
    enforceBudget(report);
    assert.throws(() => enforceBudget({ ...report, bytes: 401 * 1024 }));
    assert.throws(() => enforceBudget({ ...report, gzip: 126 * 1024 }));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
