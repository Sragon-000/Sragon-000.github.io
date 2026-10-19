import { useEditor, Field, Choice, FormSection, ImagePicker, siteField } from './EditorFields';
export default function PresentationSettings() {
  const { state } = useEditor();
  const site = state.session.data.site;
  return (
    <div className="editor-form">
      <FormSection title="전시 설정">
        <Field label="전시장 설명" target={siteField('/exhibition/description')} multiline />
        <div className="editor-grid">
          <Choice
            label="첫 관람 화면"
            target={siteField('/exhibition/defaultView')}
            options={[
              { value: 'gallery', label: '갤러리' },
              { value: 'exhibition', label: '3D 전시장' },
            ]}
          />
          <Choice
            label="테마"
            target={siteField('/theme/preset')}
            options={[
              { value: 'digital', label: '디지털 · 어두운 녹색' },
              { value: 'light', label: '라이트 · 밝은 배경' },
            ]}
          />
        </div>
        <p className="field-note">
          3D 전시장과 갤러리에서 같은 작품을 관람할 수 있습니다. 기본 화면도 미리보기로 확인해
          주세요.
        </p>
        <ImagePicker
          target="logo"
          label="전시장 로고"
          assetIds={site.theme.logoAssetId ? [site.theme.logoAssetId] : []}
        />
        <ImagePicker
          target="favicon"
          label="브라우저 아이콘"
          assetIds={site.theme.faviconAssetId ? [site.theme.faviconAssetId] : []}
        />
        <a className="text-link" href="#/studio/projects">
          작품 목록에서 전시 순서 바꾸기 ↗
        </a>
      </FormSection>
    </div>
  );
}
