import { selectProjects } from '../../domain/select';
import { useEditor, projectField } from './EditorFields';
export default function ProjectList() {
  const { state, runtime, blocked, requestDelete } = useEditor();
  const projects = selectProjects(state.session.data, 'workspace');
  return (
    <section className="project-management">
      <div className="works-heading">
        <h2>작품 목록</h2>
        <button
          className="primary"
          disabled={blocked}
          onClick={() => {
            const id = runtime.addProject();
            if (id) location.hash = `/studio/projects/${id}`;
          }}
        >
          작품 추가
        </button>
      </div>
      <p className="field-note">
        순서는 갤러리와 전시장에 함께 적용됩니다. 공개 작품{' '}
        {projects.filter((project) => project.status === 'published').length}개 · 전체{' '}
        {projects.length}개
      </p>
      {projects.length === 0 && (
        <div className="empty">
          <p>첫 작품을 추가해 이름과 요약을 입력해 주세요.</p>
        </div>
      )}
      <ol className="project-editor-list">
        {projects.map((project, index) => (
          <li key={project.id}>
            <div>
              <strong>{project.title || '제목 없는 작품'}</strong>
              <p>
                {project.genre || '장르 미입력'} ·{' '}
                {project.media.video ? '영상 등록' : '영상 미등록'}
              </p>
              <label className="check-label">
                <input
                  type="checkbox"
                  disabled={blocked}
                  checked={project.status === 'published'}
                  onChange={(event) =>
                    runtime.choose(
                      projectField(project.id, '/status'),
                      event.target.checked ? 'published' : 'draft',
                    )
                  }
                />
                {project.title || '제목 없는 작품'} 공개 대상
              </label>
            </div>
            <div className="row-actions">
              <a className="button-link" href={`#/studio/projects/${project.id}`}>
                작품 편집
              </a>
              <button
                aria-label={`${project.title || '제목 없는 작품'} 위로 이동`}
                disabled={blocked || index === 0}
                onClick={() => runtime.moveProject(project.id, -1)}
              >
                ↑ 위로
              </button>
              <button
                aria-label={`${project.title || '제목 없는 작품'} 아래로 이동`}
                disabled={blocked || index === projects.length - 1}
                onClick={() => runtime.moveProject(project.id, 1)}
              >
                ↓ 아래로
              </button>
              <button
                disabled={blocked}
                onClick={() =>
                  requestDelete({
                    title: '작품 삭제',
                    description: `‘${project.title || '제목 없는 작품'}’와 개발 기록·구조 입력 원문을 제거합니다. 이미지 파일은 보관됩니다.`,
                    run: () => runtime.removeProject(project.id),
                  })
                }
              >
                작품 삭제
              </button>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
