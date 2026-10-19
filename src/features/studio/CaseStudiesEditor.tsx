import { useEditor, projectField, Field, FormSection, linksNote, linesNote } from './EditorFields';
export default function CaseStudiesEditor({ projectId }: { projectId: string }) {
  const { state, runtime, blocked, requestDelete } = useEditor();
  const project = state.session.data.projects.find((project) => project.id === projectId);
  if (!project) return null;
  const field = (path: string) => projectField(projectId, path);
  return (
    <FormSection
      title="문제 해결 기록"
      note="실제 개발에서 겪은 문제와 검토 과정, 선택한 해결책을 작성해 주세요."
    >
      {project.caseStudies.map((study, index) => (
        <div className="case-editor" key={study.id}>
          <h4>{study.title || `개발 사례 ${index + 1}`}</h4>
          <Field label="사례 제목" target={field(`/caseStudies/${index}/title`)} />
          <Field label="문제" target={field(`/caseStudies/${index}/problem`)} multiline />
          <Field
            label="검토한 방법"
            target={field(`/caseStudies/${index}/alternatives`)}
            kind="lines"
            multiline
            note={linesNote}
          />
          <Field label="선택한 해결책" target={field(`/caseStudies/${index}/solution`)} multiline />
          <Field label="사례 결과" target={field(`/caseStudies/${index}/outcome`)} multiline />
          <Field
            label="사례 근거 링크"
            target={field(`/caseStudies/${index}/evidence`)}
            kind="links"
            multiline
            note={linksNote}
          />
          <button
            disabled={blocked}
            onClick={() =>
              requestDelete({
                title: '개발 사례 삭제',
                description: `‘${study.title || '제목 없는 사례'}’와 시스템의 사례 연결을 제거합니다.`,
                run: () => runtime.removeCase(projectId, study.id),
              })
            }
          >
            이 개발 사례 삭제
          </button>
        </div>
      ))}
      <button disabled={blocked} onClick={() => runtime.addCase(projectId)}>
        개발 사례 추가
      </button>
    </FormSection>
  );
}
