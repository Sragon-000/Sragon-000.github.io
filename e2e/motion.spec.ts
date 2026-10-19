import { test, expect } from '@playwright/test';
const activeMotion = () =>
  document
    .getAnimations()
    .filter((animation) => animation.id.startsWith('io-'))
    .map((animation) => animation.id);

test('밝은 편집기에서 입력·화면·추가·순서·삭제·미리보기에 모션을 적용하고 값은 유지한다', async ({
  page,
}, testInfo) => {
  await page.goto('/#/studio/profile');
  await expect(page.getByLabel('제작자 이름', { exact: true })).toBeVisible();
  expect(
    await page.locator('html').evaluate((element) => getComputedStyle(element).backgroundColor),
  ).toBe('rgb(241, 244, 255)');
  await page.getByLabel('제작자 이름', { exact: true }).fill('모션 검증 제작자');
  await expect.poll(() => page.evaluate(activeMotion)).toContain('io-input');
  await page.getByRole('link', { name: '전시 설정', exact: true }).click();
  await expect(page.getByLabel('테마', { exact: true })).toHaveValue('light');
  await page.getByRole('link', { name: '작품 관리', exact: true }).click();
  await page.getByRole('button', { name: '작품 추가', exact: true }).click();
  await expect(page.getByLabel('작품명', { exact: true })).toBeVisible();
  await page.getByLabel('작품명', { exact: true }).fill('모션 작품 A');
  await page.getByLabel('한 줄 요약', { exact: true }).fill('입력 보존을 확인하는 작품');
  await page.getByRole('link', { name: '← 작품 목록', exact: true }).click();
  await page.getByRole('button', { name: '작품 추가', exact: true }).click();
  await page.getByLabel('작품명', { exact: true }).fill('모션 작품 B');
  await page.getByLabel('한 줄 요약', { exact: true }).fill('순서 변경을 확인하는 작품');
  await page.getByRole('link', { name: '← 작품 목록', exact: true }).click();
  await page.getByRole('button', { name: '모션 작품 B 위로 이동', exact: true }).click();
  await expect
    .poll(() => page.locator('.project-editor-list > li strong').allTextContents())
    .toEqual(['모션 작품 B', '모션 작품 A']);
  await expect.poll(() => page.evaluate(activeMotion)).toContain('io-reorder');
  const firstRow = page.locator('.project-editor-list > li').filter({ hasText: '모션 작품 B' });
  await firstRow.getByRole('button', { name: '작품 삭제', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '작품 삭제 확인', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '취소하고 유지', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '작품 삭제 확인', exact: true })).not.toBeVisible();
  await expect(page.locator('.project-editor-list > li')).toHaveCount(2);
  await page.getByRole('link', { name: '기본 정보', exact: true }).click();
  await expect(page.getByLabel('제작자 이름', { exact: true })).toHaveValue('모션 검증 제작자');
  await page.getByRole('button', { name: '편집 내용 미리보기', exact: true }).click();
  await expect(page.locator('.preview-banner')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: '미리보기 종료하고 설정으로', exact: true }).click();
  await expect(page.getByLabel('제작자 이름', { exact: true })).toHaveValue('모션 검증 제작자');
  await page.getByRole('link', { name: '작품 관리', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('light-studio.png') });
  await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0);
});
test('동작 줄이기는 CSS와 Web Animations 모두 중지하며 화면 변경·입력을 유지한다', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#/studio/profile');
  await expect(page.getByLabel('제작자 이름', { exact: true })).toBeVisible();
  await page.getByLabel('제작자 이름', { exact: true }).fill('줄이기 검증');
  await page.getByRole('link', { name: '전시 설정', exact: true }).click();
  await expect(page.getByLabel('테마', { exact: true })).toHaveValue('light');
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  expect(
    await page
      .getByRole('link', { name: '기본 정보', exact: true })
      .evaluate((element) => getComputedStyle(element).transitionDuration),
  ).toBe('0s');
  await page.getByRole('link', { name: '기본 정보', exact: true }).click();
  await expect(page.getByLabel('제작자 이름', { exact: true })).toHaveValue('줄이기 검증');
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
});
test('모바일 밝은 설정 화면은 가로 넘침 없이 메뉴와 펼침을 사용할 수 있다', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/#/studio/projects');
  await expect(page.getByRole('heading', { name: '작품 목록', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await page.getByText('백업 또는 콘텐츠 가져오기', { exact: true }).click();
  await expect(page.getByLabel('ZIP 파일 가져오기', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('light-mobile.png') });
});
