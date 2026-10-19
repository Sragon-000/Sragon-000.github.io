import { useState } from 'react';
import blank from '../../spec/examples/blank.workspace.json';
import owner from '../../spec/examples/first-owner.workspace.json';
import architecture from '../../spec/examples/architecture.example.json';
import { preparePublicContent } from '../domain/public';
import { validatePortfolio } from '../domain/validate';
import type { Issue } from '../domain/types';
import { previewStore } from '../content/preview';
import { emptyMetadata } from '../packages/types';
import { resetGalleryReturn } from './navigation';

const examples = { blank, owner, architecture };

export default function ValidationLab() {
  const [raw, setRaw] = useState(JSON.stringify(blank, null, 2));
  const [issues, setIssues] = useState<Issue[]>([]);
  const [status, setStatus] = useState('자료를 선택하거나 JSON을 입력해 검사할 수 있습니다.');
  const [output, setOutput] = useState('');
  function inspect(publish: boolean) {
    setOutput('');
    try {
      const input: unknown = JSON.parse(raw);
      if (publish) {
        const result = preparePublicContent(input);
        setIssues(result.issues);
        setStatus(
          result.ok
            ? `공개 자료 검사 통과 · 작품 ${result.data.projects.length}개`
            : '공개 자료를 만들 수 없습니다.',
        );
        if (result.ok) setOutput(JSON.stringify(result.data, null, 2));
      } else {
        const result = validatePortfolio(input);
        setIssues(result.issues);
        setStatus(
          result.valid
            ? `형식과 관계 검사 통과 · ${result.data.kind} · 작품 ${result.data.projects.length}개`
            : '자료 검사를 통과하지 못했습니다.',
        );
      }
    } catch {
      setIssues([
        {
          code: 'JSON',
          severity: 'error',
          path: '',
          message: 'JSON 문법을 확인해 주세요. 입력 원문은 유지됩니다.',
        },
      ]);
      setStatus('JSON을 읽을 수 없습니다.');
    }
  }
  return (
    <section className="lab" aria-labelledby="lab-title">
      <div className="section-heading">
        <span className="eyebrow">DEVELOPMENT ONLY</span>
        <h2 id="lab-title">데이터 검증 도구</h2>
      </div>
      <p>
        개발 환경에서 명세와 공개 자료 선별을 확인하는 도구입니다. 입력은 이 화면의 메모리에서만
        유지됩니다.
      </p>
      <div className="actions">
        {(
          [
            ['blank', '빈 전시장'],
            ['owner', '세 작품 초안'],
            ['architecture', '구조 입력 예시'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => {
              setRaw(JSON.stringify(examples[key], null, 2));
              setIssues([]);
              setOutput('');
              setStatus('예시를 불러왔습니다. 검사를 실행해 주세요.');
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <button
        onClick={() => {
          const result = validatePortfolio(structuredClone(architecture));
          if (!result.valid) return;
          result.data.site.theme.preset = 'light';
          const graph = result.data.architectures[0]!;
          graph.nodes[0]!.contributionType = 'direct';
          graph.nodes[0]!.contributionNote = '직접 구현 강조 표시를 검사하는 기획 예시입니다.';
          graph.nodes[1]!.contributionType = 'shared';
          graph.nodes[1]!.contributionNote = '공동 구현 강조 표시를 검사하는 기획 예시입니다.';
          graph.nodes[2]!.contributionType = 'team';
          resetGalleryReturn();
          previewStore.start(
            {
              workspaceId: 'development-architecture',
              revision: 0,
              data: result.data,
              metadata: emptyMetadata(),
              assets: new Map(),
            },
            'workspace',
            location.hash,
          );
          location.hash = `/projects/${result.data.projects[0]!.slug}/architecture`;
        }}
      >
        기획 예시 그래프 미리보기
      </button>
      <div className="actions">
        <button
          onClick={() => {
            const result = validatePortfolio(structuredClone(owner));
            if (!result.valid) return;
            result.data.kind = 'example';
            result.data.site.theme.preset = 'light';
            result.data.site.profile.displayName = '전시장 검증 예시';
            result.data.site.exhibition.title = '기획 예시 전시장';
            resetGalleryReturn();
            previewStore.start(
              {
                workspaceId: 'development-exhibition',
                revision: 0,
                data: result.data,
                metadata: emptyMetadata(),
                assets: new Map(),
              },
              'workspace',
              location.hash,
            );
            location.hash = '/exhibition';
          }}
        >
          기획 예시 전시장 미리보기
        </button>
      </div>
      <label htmlFor="data-input">검사할 JSON</label>
      <textarea
        id="data-input"
        value={raw}
        spellCheck={false}
        onChange={(event) => {
          setRaw(event.target.value);
          setOutput('');
          setIssues([]);
          setStatus('입력이 변경되었습니다. 다시 검사해 주세요.');
        }}
      />
      <div className="actions">
        <button className="primary" onClick={() => inspect(false)}>
          형식·관계 검사
        </button>
        <button onClick={() => inspect(true)}>공개 자료 확인</button>
      </div>
      <p className="status" role="status">
        {status}
      </p>
      {issues.length > 0 && (
        <ul className="issues">
          {issues.map((issue, index) => (
            <li key={index} className={issue.severity}>
              <strong>
                {issue.severity === 'error' ? '수정 필요' : '안내'} · {issue.code}
              </strong>
              <span>{issue.message}</span>
              <code>{issue.path || '/'}</code>
            </li>
          ))}
        </ul>
      )}
      {output && (
        <>
          <h3>선별한 공개 JSON</h3>
          <pre>{output}</pre>
        </>
      )}
    </section>
  );
}
