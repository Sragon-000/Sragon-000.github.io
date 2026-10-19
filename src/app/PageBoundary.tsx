import { Component, type ReactNode } from 'react';
export default class PageBoundary extends Component<
  { children: ReactNode; preview: boolean },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section className="intro">
        <h1 tabIndex={-1}>화면 기능을 불러올 수 없습니다</h1>
        <p role="alert">연결을 확인하고 갤러리로 돌아가 주세요.</p>
        <a className="text-link" href="#/gallery">
          갤러리로 돌아가기 ↗
        </a>
        {!this.props.preview && (
          <button onClick={() => location.reload()}>페이지 다시 불러오기</button>
        )}
      </section>
    );
  }
}
