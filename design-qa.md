# Aurora Glass 구현 검토 — 2026-10-14

final result: passed

## 비교 대상과 상태

- 사용자가 선택한 표시 순서 2번 원본: `/Users/limseth/.codex/generated_images/01a10fd5-d931-7ea3-a634-706d2d95404b/exec-5549a890-d258-40a8-8f35-061bb3d5820e.png`.
- 몽환적인 분위기 추가 요청을 반영해 생성·표시한 기준 시안: `/Users/limseth/.codex/generated_images/01a10fd5-d931-7ea3-a634-706d2d95404b/exec-c8ec4322-0561-439d-b73f-ae3fd1749cea.png`.
- 구현 검토 주소: `http://127.0.0.1:5174/#/gallery`. 실제 사이트와 다른 origin의 임시 콘텐츠·초안으로 확인했다. 검토 후 해당 서버와 탭은 종료한다.
- 실제 앱 주소: `http://127.0.0.1:5173/`. 공개 작품 0개와 사용자 초안을 유지했다. 시안 이미지나 검토 작품을 공개 자료 또는 이 주소의 IndexedDB에 넣지 않았다.
- 데스크톱 CSS viewport 1440×1024, devicePixelRatio 1. 기준 이미지 1487×1058, 브라우저 캡처 1425×1013. 캡처 도구의 스크롤바·출력 크기 차이를 기록하고 양쪽을 1440×1024 contain으로 정규화했다. 별도 브라우저 프레임은 없다.
- 모바일 CSS viewport 390×844, 실제 문서/visual viewport 폭 375px. 시스템 스크롤바 폭을 제외한 문서 너비를 함께 확인했다. 자동 검사에서는 별도 Chromium 360px도 확인한다.
- 자료 상태: 확인된 세 작품의 이름·장르·역할과 시안의 추상 이미지를 임시 검토 자료로 사용했다. 이미지는 비교용 시안에서 추출했으며 실제 게임 화면으로 배포하지 않는다. 세 작품의 상세 소개·영상·구조는 준비 상태 그대로다.

## 전체·부분 비교 증거

각 비교 이미지를 실제로 열어 함께 확인했다. 전체 비교는 왼쪽 기준/오른쪽 구현, 부분 비교는 위 기준/아래 구현이다. 아래 출력은 Git 및 공개 빌드에서 제외한 로컬 검증 산출물이다.

- 초기 전체 비교: [comparison-before.png](./test-results/aurora/comparison-before.png).
- 수정 후 전체 비교: [comparison-final.png](./test-results/aurora/comparison-final.png).
- 제목·본문·버튼 부분 비교: [hero-comparison.png](./test-results/aurora/hero-comparison.png).
- 이미지·카드·메타데이터 부분 비교: [cards-comparison.png](./test-results/aurora/cards-comparison.png).
- 상세 화면: [detail.jpg](./test-results/aurora/detail.jpg).
- 기본 정보 입력: [studio.jpg](./test-results/aurora/studio.jpg).
- 작품 편집: [project-editor.jpg](./test-results/aurora/project-editor.jpg).
- 모바일 갤러리: [mobile.jpg](./test-results/aurora/mobile.jpg).

## 비교 이력과 수정

1. [P2, 해결] 초기 갤러리 제목이 기준보다 작고 작품 목록 시작점이 아래로 밀렸다. 초기 grid Y 약 538px, 제목 64px였다. 제목을 최대 72px/800 weight로 조정하고 hero 상단·문단 간격과 섹션 line-height를 정리했다. 수정 후 grid Y 약 493px이며 기준 카드 시작점과 가까워졌다. 전체·hero 재비교로 세 작품이 첫 데스크톱 viewport 안에 들어오는 것을 확인했다.
2. [P2, 해결] 초기 카드에서 장르가 한 줄 요약과 반복되고 메타데이터가 13px로 작았다. 중복일 때 한 번만 표시하고 데스크톱 메타데이터를 15px로 올렸다. 카드 부분 재비교에서 작품명·장르·역할을 읽을 수 있고 자료 원본은 유지됨을 확인했다.
3. [P2, 해결] 첫 작품의 설명이 이미지 아래 일반 패널로 분리되어 기준의 유리 캡션과 달랐다. 이미지 위 캡션으로 겹치고 blur·반투명 표면을 적용했다. 본문 대비를 위해 높은 불투명도와 짙은 글자를 사용한다. 수정 후 첫 카드 높이 약 413px, caption blur 16px이며 오른쪽 두 작품과 정렬된다.
4. [P3, 반영] 기존 화살표가 시안보다 무거워 보였다. 기존 텍스트 화살표를 작은 원형 면 안에 정렬하고 두께를 낮췄다. 새 아이콘·일러스트를 코드로 그리지 않았다.

현재 남은 P0/P1/P2 조치 사항은 없다. 독립적인 상세·편집 시안은 제공되지 않았으므로 두 화면의 픽셀 일치를 주장하지 않는다. 같은 배경·표면·토큰·타이포 체계를 확장하고 실제 입력·탐색 상태를 확인한 범위다.

## 필수 표면 평가

| 항목 | 결과와 근거 |
| --- | --- |
| 글꼴·타이포 | 기존 시스템 sans-serif와 한국어 fallback 유지. 제목 최대 72px, 데스크톱 메타데이터 15px. 초기 입력 14px는 후속 가독성 개선에서 16px로 올렸다. 기준과 같은 위계를 유지하며 폰트 렌더링의 플랫폼 차이는 허용한다. 모바일 제목 줄바꿈과 영문 작품명을 확인했다. |
| 간격·구성 | 첫 작품 1.55fr, 나머지 작품 1fr의 두 단 구성. 화면이 좁아지면 첫 작품과 작은 가로 카드가 한 열로 배치된다. 상세 본문·섹션 이동, 편집 폼은 min-width와 줄바꿈을 유지한다. |
| 색상·토큰 | 펄 화이트/라벤더/아이스 블루 배경, 네이비 본문, 인디고 주요 동작. 본문과 입력은 높은 불투명도, 탐색 패널은 더 투명한 면을 사용한다. 기존 digital 데이터와 테마 선택은 지원한다. |
| 이미지·자산 | 실제 생성한 배경을 WebP 20,728 bytes로 최적화해 CSS에서 import한다. 시안 전체를 배경으로 붙이거나 CSS 도형으로 대체하지 않았다. 제작자가 올린 작품 이미지는 기존 자산 참조·대체 설명·오류 처리를 사용한다. 검토용 개념 이미지는 배포하지 않는다. |
| 문구·콘텐츠 | 기존 제작자·작품 정보와 저장/공개 구분 유지. 시안의 장식용 영문 문구는 제품 기능에 필요하지 않아 추가하지 않았다. 작품 공개 수·기간·기술·성과를 추정하지 않았다. |
| 접근·상태 | 포커스 표시, 실제 input 유지, 저장 완료, 메뉴 이동, 모바일 가로 넘침, reduced motion을 확인했다. 미지원 backdrop-filter와 reduced transparency는 불투명 면으로 대응한다. |

## 동작·검증

- 별도 검토 origin에서 기본 정보 입력 → 저장 → 작품 관리 → 작품 추가·입력 → 저장 및 상세 섹션 이동을 확인했다. 실제 사용자 origin에 검증 입력을 쓰지 않았다.
- 데스크톱 갤러리→상세, 담당 역할로 이동, 갤러리 복귀, 모바일 갤러리와 편집기에서 가로 넘침 없음, 모바일 큰 면의 backdrop-filter `none`을 확인했다.
- 관람·상세·편집 검토 중 브라우저 오류 로그에 error 항목이 없었다.
- Node 211개, 전체 Chromium 21개가 통과했다. 마지막 CSS 간격·캡션 조정 후 모션/입력/미리보기·reduced motion·360px 검사 3개를 추가 재실행했다.
- 형식·린트·타입, root 및 `/Project_IO/` 빌드·dist·초기 JS 예산을 통과했다. 장식 이미지 때문에 dist가 22개 파일이 되며 알려진 해시 WebP 경로만 추가 허용하고 CSS URL의 실제 파일/base 일치도 검사한다.
- Safari/Firefox와 실제 모바일 GPU에서 블러 비용을 별도로 측정하지 않았다. 이번 검토로 특정 기기의 FPS 향상을 주장하지 않는다.

## 자산 제작 기록

소비 파일: [src/assets/aurora-dream.webp](./src/assets/aurora-dream.webp). Built-in Image Gen을 사용했으며 원본은 `/Users/limseth/.codex/generated_images/01a13837-f4a9-7c81-83ca-1cc39d857a26/exec-60407db1-344e-492f-8ba1-cede1e9b0eb2.png`다. 결과 1586×992를 원래 비율로 유지하고 sharp WebP quality 82로 압축했다. 원본은 생성 기본 경로에 보존하고 임시 PNG는 앱 소스에서 제거했다.

실제 배경 생성 프롬프트:

```text
Use case: stylized-concept. Asset type: decorative raster background for the existing Aurora Glass portfolio website, not a UI mockup. Input image is STYLE REFERENCE ONLY. Create ONE full-bleed landscape image, target 2560 by 1600 or the closest natural landscape aspect. Extract and evolve only the dreamy pale luminous background atmosphere from the reference: pearl white, icy blue, soft lavender and a trace of blush. A subtle translucent glass ribbon flowing through the upper right and far margins, one faint pearlescent orb in the upper right. Slightly dreamier soft atmospheric diffuse light, restrained iridescent prism edges, almost white broad negative space across left and center for highly readable dark webpage text. Keep the whole picture light and delicately colored, background furnishing with very low visual contrast. Opaque background. No text, letters, logo, watermark, UI, buttons, panels, cards, portfolio projects, screenshot border, game objects, planets, dark areas, stars, grain or noise. This is just the background that CSS glass panels will overlay. Preserve the refined Aurora Glass mood rather than reproducing screenshot contents.
```

## 완료 확인

- 선택된 오로라 구성을 기준으로 갤러리·상세·편집에 같은 체계 적용.
- 전체·타이포·카드 비교 후 P2 수정과 재캡처 완료.
- 기존 저장·미리보기·모션·공개 자료 보호와 root/subpath 검사 완료.
- 실제 사용자 초안과 공개 자료 보존.

후속 선택 사항은 실제 게임 미디어를 넣은 뒤 이미지별 crop 확인과 실제 기기 검토다. 기준 시안의 더 세밀한 광학 굴절·입자 표현은 실행 비용과 가독성을 고려한 P3 조정으로 남긴다.

## 가독성 보완 — 2026-10-14

사용자가 승인한 가독성 제안을 기존 시안 위에 적용했다. 배경과 장식·카드 디자인은 유지하고 입력/본문 16px, 항목명 15px/600, 도움말·주요 작은 버튼 14px와 더 짙은 보조 글자를 사용한다. 도형 안의 SVG 라벨 좌표나 그래프 데이터는 수정하지 않았다. 캡션은 별도 `--caption-surface`로 구분해 밝은 테마에서 흰색 약 95%, digital에서는 기존 짙은 표면 약 96%를 사용한다.

- 같은 빈 전시장 이름 입력란의 개선 전/후 캡처를 묶어 [항목명·도움말 비교](./test-results/legibility/field-comparison.jpg)를 확인했다. 양쪽 모두 CSS 약 681px 너비이고 같은 필드·빈 입력 상태다. 스크롤 위치 차이를 제외하고 해당 필드 영역을 crop했으며 오른쪽이 개선 후다. [입력 화면](./test-results/legibility/editor-after.jpg)에서 실제 computed style도 확인했다.
- [이미지 캡션](./test-results/legibility/gallery-after.jpg)은 별도 origin의 동일 세 작품 시안 자료로 확인했다. 흰색 alpha 242/255와 검은 이미지 배경의 최저 합성값을 사용한 계산상 대비는 제목 약 13.85:1, 보조 글자 약 6.69:1이다. digital의 흰 이미지 배경에 대한 계산은 본문 약 13.20:1이다. 블러 여부에 기대지 않는 정상 정지 상태의 색상 범위 계산이며 전체 앱의 WCAG 적합성 판정은 아니다.
- [360px 수정 전](./test-results/legibility/mobile-before.jpg)에서 Eternal_Steam이 중간에 끊기는 P2를 확인했다. 420px 이하는 세로형 카드를 사용하고, 1000px 이하에서는 갤러리 전체를 한 열로 바꿨다. [수정 후](./test-results/legibility/mobile-after.jpg) 제목이 한 줄로 이어지며 360px/720px에서 카드·문서 가로 넘침이 없었다. 720px에서도 세 작품명이 한 줄임을 DOM과 화면으로 확인했다. 이 수정 뒤 남은 P0/P1/P2는 없다.
- 브라우저 21개와 마지막 반응형 조정 후 모션·입력·미리보기/reduced motion/360px 3개, 형식·린트·타입 및 root/subpath 빌드를 통과했다. CSS와 기록만 변경해 Node 211개는 이번에 재실행하지 않았다.
- 현재 도구의 확대 단축키는 실제 zoom/기기 배율 변화를 만들지 않았다. 360px·720px reflow 확인과 실제 데스크톱 200% 텍스트 확대 검증을 혼동하지 않는다. 실제 확대·Safari/Firefox·기기별 글꼴 렌더링은 남은 확인 범위다.

final result: passed
