import { resolve } from 'node:path';
import { loadSiteContent, validateAppStatic } from './content-files';

try {
  const content = await loadSiteContent(resolve('site-content'));
  await validateAppStatic(resolve('public'));
  console.log(
    `공개 콘텐츠 검증 완료: 작품 ${content.data.projects.length}개, 구조 ${content.data.architectures.length}개, 이미지 ${content.data.assets.length}개.`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
