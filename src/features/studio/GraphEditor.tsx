import { useState, type ReactNode } from 'react';
import {
  useEditor,
  graphField,
  Field,
  Choice,
  Toggle,
  FormSection,
  linesNote,
  linksNote,
} from './EditorFields';
export default function GraphEditor({ projectId }: { projectId: string }) {
  const { runtime, state, blocked, requestDelete } = useEditor();
  const graph = state.session.data.architectures.find((graph) => graph.projectId === projectId);
  const project = state.session.data.projects.find((project) => project.id === projectId)!;
  const target = (path: string) => graphField(projectId, path);
  const nodeOptions =
    graph?.nodes.map((node) => ({ value: node.id, label: node.label || '이름 미입력' })) ?? [];
  const groupOptions =
    graph?.groups.map((group) => ({ value: group.id, label: group.label })) ?? [];
  return (
    <FormSection
      title="시스템 구조 입력"
      note="실제 구조를 목록으로 작성하고 관람 미리보기에서 2D·3D로 확인합니다. 구조를 수정하면 확인 상태를 해제합니다."
    >
      {!graph ? (
        <button disabled={blocked} onClick={() => runtime.addGraphItem(projectId, 'graph')}>
          구조 초안 만들기
        </button>
      ) : (
        <>
          <div className="editor-grid">
            <Field label="구조 기준 버전" target={target('/revision/label')} kind="optional" />
            <Field
              label="구조 확인일"
              target={target('/revision/reviewedAt')}
              kind="optional"
              placeholder="YYYY-MM-DD"
            />
          </div>
          <Field
            label="제작자 구조 확인 설명"
            target={target('/revision/sources')}
            kind="author"
            multiline
            note="어떤 코드·문서·구현을 근거로 확인했는지 작성해 주세요. 가져온 코드·문서 근거는 그대로 유지됩니다."
          />
          {graph.revision.sources
            .filter((source) => source.kind !== 'author')
            .map((source, i) => (
              <p className="field-note" key={i}>
                {source.label} · {source.url}
              </p>
            ))}
          <Toggle
            label="실제 프로젝트 자료를 기준으로 이 구조를 확인했습니다"
            target={target('/verified')}
          />
          <p className="field-note">
            확인일·근거·시스템 설명이 없거나 입력 오류가 있으면 공개 내보내기에서 알려줍니다. 미확인
            구조는 전체 초안 미리보기에서만 보입니다.
          </p>
          <h4>그룹</h4>
          {graph.groups.map((group) => (
            <GraphItem key={group.id} label={group.label} entityId={group.id}>
              {() => (
                <>
                  <Field
                    label="그룹 이름"
                    target={graphField(projectId, '/label', 'group', group.id)}
                  />
                  <Field
                    label="그룹 층"
                    target={graphField(projectId, '/layer', 'group', group.id)}
                    kind="integer"
                    note="0~20의 정수"
                  />
                  <button
                    disabled={blocked}
                    onClick={() =>
                      requestDelete({
                        title: '그룹 삭제',
                        description: `‘${group.label}’을 제거하고 ${graph.nodes.filter((node) => node.groupId === group.id).length}개 시스템의 그룹 지정을 해제합니다. 시스템은 남깁니다.`,
                        run: () => runtime.removeGraphItem(projectId, 'group', group.id),
                      })
                    }
                  >
                    이 그룹 삭제
                  </button>
                </>
              )}
            </GraphItem>
          ))}
          <button disabled={blocked} onClick={() => runtime.addGraphItem(projectId, 'group')}>
            그룹 추가
          </button>
          <h4>시스템</h4>
          {graph.nodes.map((node, index) => {
            const field = (path: string) => graphField(projectId, path, 'node', node.id);
            return (
              <GraphItem
                key={node.id}
                label={node.label || `시스템 ${index + 1}`}
                entityId={node.id}
              >
                {() => (
                  <>
                    <Field label="시스템 이름" target={field('/label')} />
                    <Field label="시스템 책임" target={field('/responsibility')} multiline />
                    <div className="editor-grid">
                      <Choice
                        label="소속 그룹"
                        target={field('/groupId')}
                        nullable
                        options={groupOptions}
                      />
                      <Choice
                        label="부모 시스템"
                        target={field('/parentId')}
                        nullable
                        options={nodeOptions.filter((item) => item.value !== node.id)}
                      />
                    </div>
                    <div className="editor-grid">
                      <Field
                        label="시스템 입력"
                        target={field('/inputs')}
                        kind="lines"
                        multiline
                        note={linesNote}
                      />
                      <Field
                        label="시스템 출력"
                        target={field('/outputs')}
                        kind="lines"
                        multiline
                        note={linesNote}
                      />
                    </div>
                    <Field label="설계 결정" target={field('/decisions')} multiline />
                    <Choice
                      label="구현 기여"
                      target={field('/contributionType')}
                      options={[
                        { value: 'unknown', label: '미정' },
                        { value: 'direct', label: '직접 구현' },
                        { value: 'shared', label: '공동 구현' },
                        { value: 'team', label: '팀 구현' },
                      ]}
                    />
                    <Field
                      label="구현 기여 설명"
                      target={field('/contributionNote')}
                      multiline
                      note="직접·공동 구현으로 공개할 때 필수입니다."
                    />
                    <Field
                      label="시스템 코드·문서 링크"
                      target={field('/codeRefs')}
                      kind="links"
                      multiline
                      note={linksNote}
                    />
                    {project.caseStudies.length > 0 && (
                      <fieldset>
                        <legend>연결된 개발 사례</legend>
                        {project.caseStudies.map((study) => (
                          <label className="check-label" key={study.id}>
                            <input
                              type="checkbox"
                              disabled={blocked}
                              checked={node.relatedCaseIds.includes(study.id)}
                              onChange={(event) =>
                                runtime.choose(
                                  field('/relatedCaseIds'),
                                  event.target.checked
                                    ? [...node.relatedCaseIds, study.id]
                                    : node.relatedCaseIds.filter((id) => id !== study.id),
                                )
                              }
                            />
                            {study.title || '제목 없는 사례'}
                          </label>
                        ))}
                      </fieldset>
                    )}
                    <button
                      disabled={blocked}
                      onClick={() =>
                        requestDelete({
                          title: '시스템 삭제',
                          description: `‘${node.label || '이름 없는 시스템'}’과 관련 연결 ${graph.edges.filter((edge) => edge.source === node.id || edge.target === node.id).length}개를 제거하고 자식 시스템의 부모 지정을 해제합니다.`,
                          run: () => runtime.removeGraphItem(projectId, 'node', node.id),
                        })
                      }
                    >
                      이 시스템 삭제
                    </button>
                  </>
                )}
              </GraphItem>
            );
          })}
          <button disabled={blocked} onClick={() => runtime.addGraphItem(projectId, 'node')}>
            시스템 추가
          </button>
          <h4>연결</h4>
          {graph.edges.map((edge, index) => {
            const field = (path: string) => graphField(projectId, path, 'edge', edge.id);
            const options = nodeOptions;
            return (
              <GraphItem key={edge.id} label={edge.label || `연결 ${index + 1}`} entityId={edge.id}>
                {() => (
                  <>
                    <div className="editor-grid">
                      <Choice label="출발 시스템" target={field('/source')} options={options} />
                      <Choice label="도착 시스템" target={field('/target')} options={options} />
                    </div>
                    <Choice
                      label="연결 종류"
                      target={field('/type')}
                      options={[
                        { value: 'call', label: '호출' },
                        { value: 'data', label: '데이터' },
                        { value: 'event', label: '이벤트' },
                        { value: 'dependency', label: '의존' },
                      ]}
                    />
                    <Field label="연결 이름" target={field('/label')} />
                    <Field label="연결 설명" target={field('/description')} multiline />
                    <button
                      disabled={blocked}
                      onClick={() =>
                        requestDelete({
                          title: '연결 삭제',
                          description: `‘${edge.label || '이름 없는 연결'}’을 제거합니다. 양쪽 시스템은 남깁니다.`,
                          run: () => runtime.removeGraphItem(projectId, 'edge', edge.id),
                        })
                      }
                    >
                      이 연결 삭제
                    </button>
                  </>
                )}
              </GraphItem>
            );
          })}
          <button
            disabled={blocked || graph.nodes.length < 2}
            onClick={() => runtime.addGraphItem(projectId, 'edge')}
          >
            연결 추가
          </button>
        </>
      )}
    </FormSection>
  );
}

function GraphItem({
  label,
  entityId,
  children,
}: {
  label: string;
  entityId: string;
  children: () => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="graph-item"
      data-graph-entity={entityId}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>{label}</summary>
      {open ? children() : null}
    </details>
  );
}
