import {
  useEditor,
  projectField,
  Field,
  FormSection,
  ImagePicker,
  linksNote,
  linesNote,
} from './EditorFields';
import GraphEditor from './GraphEditor';
import CaseStudiesEditor from './CaseStudiesEditor';
export default function ProjectEditor({ projectId }: { projectId: string }) {
  const { runtime, state, blocked, requestDelete } = useEditor();
  const project = state.session.data.projects.find((project) => project.id === projectId);
  if (!project)
    return (
      <div className="empty">
        <div>
          <h3>편집할 작품이 없습니다</h3>
          <p>작품 목록에서 다시 선택해 주세요.</p>
          <a className="text-link" href="#/studio/projects">
            작품 목록으로 ↗
          </a>
        </div>
      </div>
    );
  const field = (path: string) => projectField(projectId, path);
  const videoRaw = state.session.metadata.pendingInputs.find(
    (input) =>
      input.scope === 'project' && input.projectId === projectId && input.path === '/media/video',
  );
  return (
    <div className="project-editor">
      <div className="editor-heading">
        <a className="text-link" href="#/studio/projects">
          ← 작품 목록
        </a>
        <h2>{project.title || '새 작품 초안'}</h2>
        <span className="field-note">작품 ID는 제목과 순서 변경 후에도 유지됩니다.</span>
      </div>
      <FormSection title="작품 개요">
        <div className="editor-grid">
          <Field label="작품명" target={field('/title')} note="공개할 때 필수, 최대 120자" />
          <Field label="한 줄 요약" target={field('/summary')} note="공개할 때 필수, 최대 300자" />
          <Field label="장르" target={field('/genre')} kind="optional" />
          <Field label="담당 역할" target={field('/role')} kind="optional" />
        </div>
        <Field label="작품 소개" target={field('/overview')} multiline />
        <details>
          <summary>작품 주소 설정</summary>
          <Field
            label="작품 주소 이름"
            target={field('/slug')}
            note="영문 소문자·숫자·하이픈, 최대 64자. 변경하면 기존 상세 링크가 바뀝니다."
          />
        </details>
        <label className="check-label">
          <input
            type="checkbox"
            disabled={blocked}
            checked={project.status === 'published'}
            onChange={(event) =>
              runtime.choose(field('/status'), event.target.checked ? 'published' : 'draft')
            }
          />
          공개 대상으로 선택
        </label>
        <p className="field-note">
          공개 미리보기와 내보내기에 포함합니다. 실제 사이트는 파일을 반영하고 배포한 뒤 변경됩니다.
        </p>
      </FormSection>
      <FormSection title="제작 정보">
        <div className="editor-grid">
          <Field
            label="제작 시작 월"
            target={field('/period/start')}
            kind="optional"
            placeholder="YYYY-MM"
          />
          <Field
            label="제작 종료 월"
            target={field('/period/end')}
            kind="optional"
            placeholder="YYYY-MM"
          />
          <Field
            label="팀 규모"
            target={field('/teamSize')}
            kind="integer"
            note="비우면 미입력, 1 이상의 정수"
          />
        </div>
        <label className="check-label">
          <input
            type="checkbox"
            checked={project.period.ongoing}
            disabled={blocked}
            onChange={(event) => runtime.setOngoing(projectId, event.target.checked)}
          />
          진행 중
        </label>
        <div className="editor-grid">
          <Field
            label="플랫폼"
            target={field('/platforms')}
            kind="lines"
            multiline
            note={linesNote}
          />
          <Field
            label="사용 기술"
            target={field('/technologies')}
            kind="lines"
            multiline
            note={linesNote}
          />
        </div>
      </FormSection>
      <FormSection title="이미지와 플레이 영상">
        <ImagePicker
          target="cover"
          projectId={projectId}
          label="대표 이미지"
          assetIds={project.media.coverAssetId ? [project.media.coverAssetId] : []}
        />
        <ImagePicker
          target="screenshot"
          projectId={projectId}
          label="게임 화면"
          assetIds={project.media.screenshotAssetIds}
        />
        <div className="editor-field">
          <label htmlFor={`video-${projectId}`}>YouTube 영상</label>
          <input
            id={`video-${projectId}`}
            disabled={blocked}
            value={videoRaw?.rawValue ?? project.media.video?.videoId ?? ''}
            maxLength={20000}
            aria-invalid={Boolean(videoRaw)}
            onChange={(event) => runtime.editProjectVideo(projectId, event.target.value)}
            placeholder="YouTube 주소 또는 영상 ID"
          />
          <p className={videoRaw ? 'field-error' : 'field-note'}>
            {videoRaw
              ? '지원하는 YouTube 주소인지 확인해 주세요. 원문과 기존 영상을 보존합니다.'
              : '비우면 연결 해제. 실제 재생은 미리보기에서 확인해 주세요.'}
          </p>
        </div>
        {project.media.video && <Field label="영상 제목" target={field('/media/video/title')} />}
      </FormSection>
      <FormSection title="개인 기여">
        <div className="editor-grid">
          <Field
            label="직접 담당한 작업"
            target={field('/contribution/responsibilities')}
            kind="lines"
            multiline
            note={linesNote}
          />
          <Field
            label="팀을 이끈 경험"
            target={field('/contribution/leadership')}
            kind="lines"
            multiline
            note={linesNote}
          />
        </div>
      </FormSection>
      <CaseStudiesEditor projectId={projectId} />
      <FormSection title="결과와 회고">
        <Field label="작품 결과" target={field('/outcome')} multiline />
        <Field label="회고" target={field('/reflection')} multiline />
        <Field
          label="코드·문서·배포 링크"
          target={field('/links')}
          kind="links"
          multiline
          note={linksNote}
        />
      </FormSection>
      <GraphEditor projectId={projectId} />
      <div className="danger-zone">
        <button
          disabled={blocked}
          onClick={() =>
            requestDelete({
              title: '작품 삭제',
              description: `‘${project.title || '제목 없는 작품'}’와 개발 기록·구조·해당 입력 원문을 제거합니다. 이미지 파일은 백업에 보관하고 배포된 사이트는 변경하지 않습니다.`,
              run: () => {
                runtime.removeProject(projectId);
                location.hash = '/studio/projects';
              },
            })
          }
        >
          이 작품 삭제
        </button>
      </div>
    </div>
  );
}
