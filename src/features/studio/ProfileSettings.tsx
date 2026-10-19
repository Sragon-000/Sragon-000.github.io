import {
  useEditor,
  Field,
  FormSection,
  ImagePicker,
  siteField,
  linksNote,
  linesNote,
} from './EditorFields';
export default function ProfileSettings() {
  const { state } = useEditor();
  const site = state.session.data.site;
  return (
    <div className="editor-form">
      <FormSection title="제작자 소개">
        <div className="editor-grid">
          <Field
            id="owner-name"
            label="제작자 이름"
            target={siteField('/profile/displayName')}
            note="공개할 때 필수, 최대 40자"
          />
          <Field
            id="exhibition-title"
            label="전시장 이름"
            target={siteField('/exhibition/title')}
            note="공개할 때 필수, 최대 80자"
          />
        </div>
        <Field label="자기소개" target={siteField('/profile/bio')} multiline />
        <Field
          label="개발 관심 분야"
          target={siteField('/profile/interests')}
          kind="lines"
          multiline
          note={linesNote}
        />
        <Field
          label="제작자 공개 링크"
          target={siteField('/profile/links')}
          kind="links"
          multiline
          note={linksNote}
        />
        <ImagePicker
          target="avatar"
          label="프로필 이미지"
          assetIds={site.profile.avatarAssetId ? [site.profile.avatarAssetId] : []}
        />
      </FormSection>
    </div>
  );
}
