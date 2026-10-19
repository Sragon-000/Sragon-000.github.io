import { selectProjects } from '../../domain/select';
import { useEditor } from './EditorFields';
export default function ExportGuidance() {
  const { state } = useEditor();
  const projects = selectProjects(state.session.data, 'workspace');
  return (
    <div className="export-guidance">
      <h2>내보내기와 배포</h2>
      <p>
        공개 대상 {projects.filter((project) => project.status === 'published').length}개 · 초안{' '}
        {projects.filter((project) => project.status === 'draft').length}개
      </p>
      <ol>
        <li>공개 대상 미리보기에서 작품과 영상을 확인합니다.</li>
        <li>공개 콘텐츠 ZIP을 생성하고 다운로드합니다. 전체 초안 백업도 별도로 보관합니다.</li>
        <li>자기 저장소의 로컬 폴더에서 아래 명령으로 ZIP을 검증하고 반영합니다.</li>
        <li>빌드와 관람을 확인한 뒤 site-content 변경을 GitHub 기본 브랜치에 올립니다.</li>
        <li>
          저장소 Settings → Pages의 Source를 GitHub Actions로 설정하고 Actions의 배포 성공과 실제
          공개 주소를 확인합니다.
        </li>
      </ol>
      <pre>
        <code>
          {'npm run content:import -- "/경로/공개콘텐츠.zip"\nnpm run build\nnpm run preview'}
        </code>
      </pre>
      <p className="field-note">
        다운로드와 로컬 반영은 실제 배포와 별개입니다. 제공된 워크플로는 기본 브랜치에서 검사 후
        배포하며, 공개 주소는 Actions의 배포 결과에서 확인합니다. 기존 공개 파일은 로컬 반영 시 별도
        폴더에 보존됩니다.
      </p>
      <p className="field-note">
        친구에게 템플릿을 나눌 때는 빈 site-content를 사용하세요. 이미 개인화한 사이트를 복제하면
        공개된 이름과 작품도 함께 복제됩니다.
      </p>
    </div>
  );
}
