import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createWorkspace } from '../src/domain/create';
import { scenePalette } from '../src/three/palette';
import { buildArchitectureScene } from '../src/three/ArchitectureScene';
import { largeGraph } from '../scripts/performance/fixtures';
import { Color } from 'three';
import { sharingCard } from '../scripts/sharing';
import sharp from 'sharp';
test('새 초안과 3D 배경은 밝은 테마를 사용하고 기존 digital도 유지한다', () => {
  assert.equal(createWorkspace().site.theme.preset, 'light');
  for (const theme of ['light', 'digital'] as const) {
    const scene = buildArchitectureScene(largeGraph(2), () => undefined, theme);
    assert.equal(
      (scene.scene.background as Color).getHexString(),
      scenePalette(theme).background.slice(1),
    );
    scene.dispose();
  }
});
test('공유 JPEG는 실제 공개 설정의 밝은/어두운 색을 반영한다', async () => {
  const data = createWorkspace();
  for (const theme of ['light', 'digital'] as const) {
    data.site.theme.preset = theme;
    const bytes = await sharingCard(data, new Map());
    const { data: pixels } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
    const expected = scenePalette(theme)
      .background.slice(1)
      .match(/../g)!
      .map((value) => parseInt(value, 16));
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(pixels[i]! - expected[i]!) <= 3);
  }
});
