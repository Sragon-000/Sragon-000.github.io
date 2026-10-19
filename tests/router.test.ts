import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseRoute, routeHash, type Route } from '../src/app/router';

test('관람과 설정 주소 및 작품 ID/slug는 새로고침 가능한 해시로 왕복한다', () => {
  const routes: Route[] = [
    { name: 'gallery' },
    { name: 'exhibition' },
    { name: 'project', slug: 'space-game' },
    { name: 'architecture', slug: 'space-game' },
    { name: 'studio', screen: 'profile' },
    { name: 'studio', screen: 'projects' },
    { name: 'studio', screen: 'projects', projectId: 'project-a' },
    { name: 'studio', screen: 'presentation' },
    { name: 'studio', screen: 'export' },
  ];
  for (const route of routes) assert.deepEqual(parseRoute(routeHash(route)), route);
});
test('기본 보기와 설정 별칭', () => {
  assert.deepEqual(parseRoute(''), { name: 'gallery' });
  assert.deepEqual(parseRoute('#/', 'exhibition'), { name: 'exhibition' });
  assert.deepEqual(parseRoute('#/studio'), { name: 'studio', screen: 'profile' });
  assert.deepEqual(parseRoute('#/gallery/'), { name: 'gallery' });
});
test('잘못된 주소는 다른 화면으로 숨기지 않는다', () => {
  for (const hash of [
    '#/nope',
    '#/projects/a/extra',
    '#/projects/%',
    '#/projects/A',
    '#/projects/a%2Fb',
    '#/studio/export/a',
    '#main',
    '#/projects/' + 'a'.repeat(65),
  ])
    assert.deepEqual(parseRoute(hash), { name: 'not-found' }, hash);
});
