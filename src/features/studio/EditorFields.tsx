import { createContext, useContext, useEffect, useId, useState, type ReactNode } from 'react';
import {
  displayValue,
  fieldValue,
  sameTarget,
  type FieldTarget,
  type InputKind,
} from '../../domain/edit';
import type { WorkspaceController, WorkspaceState } from '../../storage/controller';
interface Context {
  runtime: WorkspaceController;
  state: WorkspaceState;
  blocked: boolean;
  requestDelete: (request: { title: string; description: string; run: () => void }) => void;
}
export const EditorContext = createContext<Context | null>(null);
export function useEditor() {
  const context = useContext(EditorContext);
  if (!context) throw Error('편집 환경이 필요합니다.');
  return context;
}
export const siteField = (path: string): FieldTarget => ({
  scope: 'site',
  projectId: null,
  entityId: null,
  path,
});
export const projectField = (projectId: string, path: string): FieldTarget => ({
  scope: 'project',
  projectId,
  entityId: null,
  path,
});
export const graphField = (
  projectId: string,
  path: string,
  scope: FieldTarget['scope'] = 'graph',
  entityId: string | null = null,
): FieldTarget => ({ scope, projectId, entityId, path });
export function Field({
  label,
  target,
  kind = 'text',
  multiline = false,
  note,
  placeholder,
  id: explicitId,
}: {
  label: string;
  target: FieldTarget;
  kind?: InputKind;
  multiline?: boolean;
  note?: string;
  placeholder?: string;
  id?: string;
}) {
  const { state, runtime, blocked } = useEditor();
  const generated = useId();
  const id = explicitId ?? generated;
  const pending = state.session.metadata.pendingInputs.find((input) => sameTarget(input, target));
  const value = pending?.rawValue ?? displayValue(fieldValue(state.session.data, target), kind);
  const props = {
    id,
    value,
    disabled: blocked,
    maxLength: 20000,
    placeholder,
    'aria-invalid': Boolean(pending),
    'aria-describedby': note || pending ? `${id}-note` : undefined,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      runtime.edit(target, event.target.value, kind),
  };
  return (
    <div className="editor-field">
      <label htmlFor={id}>{label}</label>
      {multiline ? <textarea {...props} className="editor-textarea" /> : <input {...props} />}
      {(note || pending) && (
        <p className={pending ? 'field-error' : 'field-note'} id={`${id}-note`}>
          {pending ? '입력을 확인해 주세요. 원문을 보관하고 마지막 유효 값을 유지합니다.' : note}
        </p>
      )}
    </div>
  );
}
export function Choice({
  label,
  target,
  options,
  nullable = false,
}: {
  label: string;
  target: FieldTarget;
  options: { value: string; label: string }[];
  nullable?: boolean;
}) {
  const { state, runtime, blocked } = useEditor();
  const id = useId();
  const value = fieldValue(state.session.data, target);
  return (
    <div className="editor-field">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        disabled={blocked}
        value={String(value ?? '')}
        onChange={(event) =>
          runtime.choose(target, nullable && !event.target.value ? null : event.target.value)
        }
      >
        {nullable && <option value="">선택 없음</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
export function Toggle({ label, target }: { label: string; target: FieldTarget }) {
  const { state, runtime, blocked } = useEditor();
  return (
    <label className="check-label">
      <input
        type="checkbox"
        disabled={blocked}
        checked={Boolean(fieldValue(state.session.data, target))}
        onChange={(event) => runtime.choose(target, event.target.checked)}
      />
      {label}
    </label>
  );
}
export function FormSection({
  title,
  children,
  note,
}: {
  title: string;
  children: ReactNode;
  note?: string;
}) {
  return (
    <section className="editor-section">
      <h3>{title}</h3>
      {note && <p className="field-note">{note}</p>}
      {children}
    </section>
  );
}
export function LocalImage({ assetId }: { assetId: string }) {
  const { state } = useEditor();
  const blob = state.session.assets.get(assetId);
  const asset = state.session.data.assets.find((asset) => asset.id === assetId);
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!blob) {
      setUrl('');
      return;
    }
    const value = URL.createObjectURL(blob);
    setUrl(value);
    return () => URL.revokeObjectURL(value);
  }, [blob]);
  return url && asset ? <img className="editor-image" src={url} alt={asset.alt} /> : null;
}
const imageDescriptions = new Map<string, string>();
export function ImagePicker({
  target,
  projectId,
  label,
  assetIds,
}: {
  target: 'avatar' | 'cover' | 'screenshot' | 'logo' | 'favicon';
  projectId?: string;
  label: string;
  assetIds: string[];
}) {
  const { runtime, blocked, state } = useEditor();
  const id = useId();
  const cacheKey = `${state.session.workspaceId}/${projectId ?? 'site'}/${target}`;
  const [alt, setAlt] = useState(() => imageDescriptions.get(cacheKey) ?? '');
  const [error, setError] = useState('');
  return (
    <div className="image-picker">
      <div className="image-list">
        {assetIds.map((assetId) => (
          <figure key={assetId}>
            <LocalImage assetId={assetId} />
            <figcaption>
              {state.session.data.assets.find((asset) => asset.id === assetId)?.alt}
            </figcaption>
            <button
              disabled={blocked}
              onClick={() => runtime.removeImageRef(target, projectId, assetId)}
            >
              {label} 연결 해제
            </button>
          </figure>
        ))}
      </div>
      <label htmlFor={`${id}-alt`}>{label} 대체 설명</label>
      <input
        id={`${id}-alt`}
        disabled={blocked}
        value={alt}
        maxLength={300}
        onChange={(event) => {
          setAlt(event.target.value);
          imageDescriptions.set(cacheKey, event.target.value);
          setError('');
        }}
        placeholder="이미지에 보이는 내용을 설명해 주세요"
      />
      <label htmlFor={id}>{label} 파일 선택</label>
      <input
        id={id}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/avif"
        disabled={blocked}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          if (!alt.trim()) {
            setError('이미지 대체 설명을 입력한 뒤 파일을 선택해 주세요.');
            return;
          }
          void runtime.addImage(file, alt, target, projectId);
        }}
      />
      <p className="field-note">
        PNG · JPEG · WebP · AVIF, 파일당 최대 10MiB · 4천만 픽셀. 연결 해제와 교체 전 파일은 전체
        백업에 보관됩니다.
      </p>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
export const linksNote = '한 줄에 하나씩: 자료 이름 | https://주소';
export const linesNote = '한 줄에 하나씩 입력해 주세요.';
