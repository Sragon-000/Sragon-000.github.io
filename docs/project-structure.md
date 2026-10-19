# IO 프로젝트 전체 구조와 기능 구성

작성 기준: 2026-10-14의 실제 소스와 설정 파일. 디자인·색상·테마·스타일·화면 배치·웹 애니메이션의 설명은 제외한다. 관람 및 편집 기능, 데이터 계약, 저장, 파일 처리, 3D 실행 구조, 빌드와 배포를 다룬다.

## 1. 프로젝트 목적과 운영 방식

IO는 게임공학 프로젝트를 갤러리와 3D 전시장으로 소개하는 정적 웹 애플리케이션이다. 작품별 영상, 개인 기여, 개발 사례와 시스템 아키텍처를 함께 제공한다.

사용자는 템플릿을 복제해 자신의 콘텐츠와 GitHub Pages 주소로 운영한다. 친구들의 자료를 한 서버에서 관리하는 방식이 아니라 각자의 저장소와 사이트를 사용하는 구조다.

| 구분 | 현재 구성 |
| --- | --- |
| 실행 형태 | React 기반 단일 페이지 애플리케이션(SPA) |
| 주소 처리 | URL hash 기반 라우팅 |
| 공개 호스팅 | GitHub Pages용 정적 빌드 |
| 제작자 편집 | 브라우저의 Studio |
| 초안 저장 | 현재 브라우저의 IndexedDB |
| 다른 기기로 이동 | 전체 초안 백업 ZIP |
| 공개 콘텐츠 반영 | 공개 ZIP을 로컬 저장소에 가져온 뒤 빌드·배포 |
| 영상 | YouTube 주소/ID 입력 및 임베드 재생 |
| 시스템 구조 | 공통 그래프 데이터의 2D·3D 탐색 |
| 서버·계정 | 자체 API 서버, 로그인, 클라우드 초안 동기화 없음 |

Studio는 사이트 서버의 파일을 직접 수정하지 않는다. 방문자가 Studio 주소에 들어가도 자신의 브라우저 초안을 편집할 뿐이며, 배포된 콘텐츠를 변경하려면 저장소에 공개 자료를 반영하고 다시 배포해야 한다.

## 2. 전체 계층과 책임

| 계층 | 경로 | 책임 |
| --- | --- | --- |
| 앱 진입·이동 | `src/main.tsx`, `src/app/` | 앱 시작, 라우팅, 화면 로딩 경계, 탐색 상태 |
| 기능 | `src/features/` | 갤러리, 작품 상세, Studio, 영상, 그래프, 전시장 |
| 관람 자료 공급 | `src/content/` | 배포 파일 로딩과 초안 미리보기를 공통 관람 인터페이스로 제공 |
| 도메인 | `src/domain/` | 데이터 타입, 생성·편집 보조, 검증, 공개 선별, 공통 조회 |
| 초안 상태·저장 | `src/storage/` | 편집 명령, 세션 상태, IndexedDB, 충돌·복구 처리 |
| 파일 패키지 | `src/packages/` | ZIP·JSON·이미지 검사, 백업·공개 패키지 변환 |
| 3D 실행 | `src/three/` | 렌더러, 장면 생성, 카메라 계산과 자원 수명 관리 |
| 개발·배포 도구 | `scripts/`, `.github/` | 콘텐츠 반영, 빌드 연결, 산출물 검사, 공유 문서 생성과 배포 |

도메인은 React·저장소·화면·Three.js에 의존하지 않는다. 저장 및 패키지 계층도 화면이나 렌더러를 가져오지 않는다. 이 경계는 `.oxlintrc.json`의 import 제한으로 검사한다.

기능 코드는 공통 도메인 규칙을 호출하고, Studio의 변경은 Controller와 편집 명령을 통해 적용한다. 3D 장면은 같은 작품·그래프 자료에서 생성하며 별도의 콘텐츠 원본을 만들지 않는다.

## 3. 주요 폴더 구성

아래는 기능과 운영에 관련된 주요 경로다. 디자인 전용 파일과 개별 테스트 파일은 생략했다.

```text
Project_IO/
├── src/
│   ├── main.tsx
│   ├── app/
│   │   ├── App.tsx                 # 앱 조합과 관람/편집 분기
│   │   ├── router.ts               # 주소 해석과 생성
│   │   ├── navigation.ts           # 관람 복귀 상태
│   │   ├── PageBoundary.tsx        # 화면 로딩 실패 복구
│   │   └── ValidationLab.tsx       # 개발 환경 전용 검증 도구
│   ├── domain/
│   │   ├── types.ts                # 콘텐츠 자료형
│   │   ├── create.ts               # 빈 작업 공간과 ID 생성
│   │   ├── edit.ts                 # 필드 변환과 입력 처리
│   │   ├── media.ts                # 영상 입력 정규화
│   │   ├── validate.ts             # 형식·관계·공개 검증
│   │   ├── schema-validator.ts     # Schema 검증 진입점
│   │   ├── public.ts               # 공개 콘텐츠 선별
│   │   └── select.ts               # 관람 모드·순서별 조회
│   ├── storage/
│   │   ├── controller.ts           # 상태·저장·가져오기 조율
│   │   ├── edit-commands.ts        # 편집 명령과 참조 정리
│   │   ├── workspaces.ts           # IndexedDB 저장과 버전 비교
│   │   └── runtime.ts              # 앱 세션의 Controller 연결
│   ├── packages/
│   │   ├── portfolio-package.ts    # 백업/공개 패키지 읽기·생성
│   │   ├── types.ts                # 세션·백업·manifest 자료형
│   │   ├── metadata.ts             # 편집 메타데이터 해석
│   │   ├── manifest.ts             # 파일 목록 검사
│   │   ├── backup-validator.ts     # 백업 메타데이터 검증
│   │   ├── manifest-validator.ts   # manifest Schema 검증
│   │   ├── policy.ts               # 공통 경로·파일 한도
│   │   ├── json.ts                 # 크기 제한 JSON 처리
│   │   ├── images.ts               # 실제 이미지 검사
│   │   ├── zip.ts                  # ZIP 처리 진입점·Worker 선택
│   │   ├── zip-core.ts             # ZIP 구조·압축·CRC 검사
│   │   ├── zip-worker.ts           # 큰 ZIP의 별도 스레드 처리
│   │   └── zip-protocol.ts         # Worker 메시지 계약
│   ├── content/
│   │   ├── public-loader.ts        # 공개 파일 요청·검증
│   │   ├── preview.ts              # 읽기 전용 미리보기 스냅샷
│   │   └── viewer.tsx              # 관람 자료 공급자
│   ├── features/
│   │   ├── gallery/                # 작품 목록
│   │   ├── project/                # 작품 상세·그래프 확대 진입
│   │   ├── media/                  # 이미지·YouTube·공유 링크
│   │   ├── studio/                 # 제작자·작품·구조 편집 및 파일 이동
│   │   ├── architecture/           # 그래프 배치·선택·2D/3D 탐색
│   │   └── exhibition/             # 전시실 배치·이동·복귀 상태
│   └── three/
│       ├── RendererHost.ts         # WebGL 렌더러와 입력·프레임 관리
│       ├── ArchitectureScene.ts    # 시스템 그래프 장면
│       ├── ExhibitionScene.ts      # 작품 전시장 장면
│       ├── LabelAtlas.ts           # 여러 라벨의 텍스처 공유
│       ├── framing.ts              # 카메라 프레이밍 계산
│       └── lifecycle.ts            # 공통 자원 정리
├── site-content/                   # 현재 배포 대상으로 관리하는 공개 자료
├── public/                         # 앱 기본 정적 파일·라이선스
├── scripts/                        # 콘텐츠·빌드·공유·성능 도구
├── spec/
│   ├── schemas/                    # portfolio/backup/manifest JSON Schema
│   ├── examples/                   # 빈 템플릿·개인 초안·구조 예시
│   ├── performance/                # 큰 자료 측정 기록
│   └── verification.md             # 검증 범위와 결과 기록
├── tests/                          # Node 자동 검사
├── e2e/                            # 독립 Chromium 브라우저 검사
├── docs/                           # 기획·설계·운영·작업 기록
├── .github/workflows/pages.yml     # 검사·빌드·Pages 배포
├── legacy/static-gallery/          # 초기 정적 갤러리 보존본
├── vendor/                         # 준비용 보관 자료, 앱 빌드 입력에서 제외
├── .portfolio-drafts/              # 개인 초안, Git·공개 빌드 제외
├── dist/                           # 생성되는 정적 배포 산출물
├── package.json / package-lock.json
├── vite.config.ts
├── tsconfig.json
└── playwright.config.ts
```

## 4. 기능과 주소 구성

| 주소 | 기능 | 주요 모듈 |
| --- | --- | --- |
| `#/` | 설정한 첫 관람 화면으로 진입 | `app/router.ts` |
| `#/gallery` | 공개 작품 목록과 상세 진입 | `gallery/Gallery.tsx` |
| `#/exhibition` | 전시실·작품 선택·상세 이동 | `exhibition/ExhibitionPage.tsx`, `Exhibition3D.tsx` |
| `#/projects/<slug>` | 작품 소개·미디어·기여·사례·구조·링크 | `project/ProjectDetail.tsx` |
| `#/projects/<slug>/architecture` | 해당 작품의 아키텍처 확대 탐색 | `ProjectDetail.tsx`, `architecture/ArchitectureExplorer.tsx` |
| `#/studio`, `#/studio/profile` | 제작자 소개·관심 분야·공개 링크·프로필 이미지 | `studio/ProfileSettings.tsx` |
| `#/studio/projects` | 작품 추가·순서 변경·공개 대상 선택·삭제 | `studio/ProjectList.tsx` |
| `#/studio/projects/<projectId>` | 작품·개발 사례·시스템 구조 편집 | `ProjectEditor.tsx`, `CaseStudiesEditor.tsx`, `GraphEditor.tsx` |
| `#/studio/presentation` | 전시장 제목·설명·첫 관람 화면 설정 | `studio/PresentationSettings.tsx` |
| `#/studio/export` | 저장·백업·공개 내보내기·가져오기·배포 안내 | `WorkspaceTools.tsx`, `ExportGuidance.tsx` |

작품의 내부 연결은 `projectId`, 공개 상세 주소는 `slug`를 사용한다. 제목을 바꾸거나 작품 순서를 이동해도 ID와 입력 원문의 소속은 유지한다. 잘못된 주소는 찾을 수 없음 상태로 처리한다.

## 5. 데이터 모델

### 5.1 콘텐츠 원본

`Portfolio`의 `schemaVersion`은 현재 `1.0.0`이다.

| 항목 | 저장 내용 |
| --- | --- |
| `kind` | `workspace`: 편집용, `public`: 공개용, `example`: 검증·기획 예시 |
| `site` | 제작자 소개·링크·이미지 참조, 전시장 정보와 작품 순서 등 사이트 설정 |
| `projects` | 작품 ID·slug·소개·상태·역할·기간·플랫폼·기술·팀 규모·미디어·기여·사례·회고·링크 |
| `architectures` | 작품별 시스템 그룹·노드·연결·확인 상태·근거 |
| `assets` | 이미지 ID·경로·MIME·바이트 수·크기·대체 설명 |

이미지 바이트는 JSON에 base64로 넣지 않는다. 브라우저에서는 Blob으로, 패키지에서는 별도 파일로 보관하고 콘텐츠가 자산 ID로 참조한다.

### 5.2 작품·개발 사례·시스템 구조

- 작품 상태는 `draft`와 `published`다. `published`는 공개 패키지에 포함할 대상이라는 뜻이며 실제 인터넷 게시 완료를 뜻하지 않는다.
- 개발 사례는 문제, 대안, 해결 방법, 결과와 근거 링크를 기록한다. 노드에서 같은 작품의 사례 ID를 참조할 수 있다.
- 작품당 아키텍처는 최대 하나다. `groups`, `nodes`, `edges`와 `revision` 근거를 가진다.
- 노드는 책임, 입출력, 설계 결정, 기여 구분, 사례 참조와 코드 링크를 기록한다. 기여는 `direct`, `shared`, `team`, `unknown`으로 구분한다.
- 연결 종류는 `call`, `data`, `event`, `dependency`이며 출발·도착 방향을 보존한다.
- 부모 관계의 순환은 금지한다. 일반 시스템 연결은 순환·자기 연결·평행 연결을 표현할 수 있다.
- 구조를 수정하면 확인 상태를 해제한다. 공개 자료에는 작성자가 확인한 그래프만 포함한다.

### 5.3 편집 상태와 관람 상태

`WorkspaceSession`은 콘텐츠 외에 `workspaceId`, 변경 번호인 `revision`, 백업 메타데이터, 이미지 Blob Map과 로컬 저장 버전인 `storageToken`을 가진다.

백업 메타데이터에는 저장 시각, 마지막 편집 화면·작품 ID와 `pendingInputs`를 기록한다. 유효한 자료로 변환할 수 없는 입력은 마지막 정상 값과 분리하여 원문을 보존한다. 공개 대상에 미정리 입력이 남으면 공개 내보내기를 막는다.

그래프 선택·시점·확대, 전시실·작품 선택·카메라, 관람 복귀 위치는 페이지 메모리의 세션 상태다. 콘텐츠 JSON과 백업 ZIP에 넣지 않으며 새로고침 이후 유지되는 저장 설정과 구분한다. `storageToken` 역시 로컬 저장 충돌 검사용으로만 사용하고 패키지에 넣지 않는다.

## 6. 주요 데이터 흐름

### 6.1 초안 편집과 저장

```text
Studio 입력
  → WorkspaceController
  → editWorkspace 편집 명령
  → 도메인 형식·관계 검증
  → 유효 콘텐츠 또는 미정리 입력 원문 갱신
  → 저장 요청
  → 현재 저장본 버전 비교
  → IndexedDB에 콘텐츠·메타데이터·이미지 동시 저장
```

IndexedDB 데이터베이스 이름은 `io-portfolio-v1`이다. `workspaces`는 사이트 키, `assets`는 작업 공간 ID와 자산 ID의 조합으로 관리한다. 사이트 키는 현재 origin과 배포 base 경로로 생성한다.

저장 성공은 트랜잭션 완료 후 알린다. 여러 탭에서 저장본이 달라지면 버전 비교로 덮어쓰기를 막고 현재 입력과 백업 기능을 유지한다. 저장본 읽기에 실패했을 때 빈 초안을 정상 저장본으로 자동 교체하지 않는다.

작품·노드·사례 삭제 시 연결 참조와 원문 소속을 함께 정리한다. 직전 삭제는 한 단계 되돌릴 수 있다. 이미지 연결 해제는 원본 파일 삭제와 구분하며, 전체 백업에는 연결 해제한 파일도 보관할 수 있다.

### 6.2 미리보기

현재 유효 콘텐츠에서 읽기 전용 스냅샷을 만든 뒤 `ViewerProvider`에 공급한다. 공개 대상만 보기와 초안 포함 전체 보기를 구분한다. 미리보기 종료 후 편집 입력을 유지하고, 새로고침하면 배포된 공개 자료를 읽는다. 임시 이미지 URL은 종료 시 정리한다.

### 6.3 공개 콘텐츠 관람

```text
export-manifest.json
  → content/site.json + projects.json + assets.json
  → 공개 자료 검증
  → 갤러리·작품 상세·전시장 공통 공급
  → 해당 작품 방문 시 아키텍처 JSON 요청
  → 표시할 이미지 요청 / 재생 선택 시 YouTube 로딩
```

공개 로더는 manifest의 종류·파일 목록·바이트 수와 요청 크기를 검사한다. 콘텐츠 없음과 잘못된 자료를 구분하고 재시도를 제공한다. 브라우저에서 공개 JSON을 읽는 과정은 ZIP 전체 검사와 다른 경로다. 이미지의 실제 디코딩 검사는 입력·패키지·빌드 단계에서 수행한다.

### 6.4 가져오기와 공개 반영

가져오기는 ZIP 또는 JSON과 별도 이미지 파일을 임시 상태에서 검증한 뒤 내용 요약을 보여준다. 사용자가 교체를 확인해야 저장본 버전을 비교하고 전체 작업 공간을 교체한다. 임의 병합은 하지 않으며 취소·검사 실패 시 기존 초안을 유지한다.

공개 선별은 원본을 복사하여 공개 작품, 확인한 그래프, 참조하는 이미지만 남긴다. 초안과 미사용 자산, 편집 원문은 공개 출력에서 제외한다. 결과를 다시 검증한 뒤 ZIP을 만든다.

```text
브라우저 초안 → 공개 콘텐츠 ZIP
  → content:import → site-content/
  → build → dist/
  → 저장소 기본 브랜치의 Actions → GitHub Pages
```

ZIP 다운로드만으로 게시되지 않는다. 실제 배포 입력은 저장소의 `site-content/`이며 브라우저 IndexedDB는 빌드가 읽지 않는다.

## 7. 파일 패키지와 검사 정책

### 전체 초안 백업 ZIP

```text
export-manifest.json
portfolio.json
backup.json
assets/<자산 ID>.<지원 확장자>
```

편집 콘텐츠, 미정리 입력과 편집 위치, 이미지 원본을 옮기는 용도다.

### 공개 콘텐츠 ZIP 및 site-content

```text
export-manifest.json
content/site.json
content/projects.json
content/assets.json
content/architectures/<projectId>.json   # 공개할 확인된 그래프가 있을 때
assets/<자산 ID>.<지원 확장자>            # 참조한 이미지가 있을 때
```

`content/site.json`은 `schemaVersion`, `kind`, `site`를 가진 객체다. 작품·자산 파일은 배열이며 구조 파일은 개별 Architecture 객체다. manifest는 자기 자신을 제외한 정확한 파일 경로와 바이트 수를 기록한다.

| 검사 항목 | 현재 정책 |
| --- | --- |
| ZIP 파일 크기 | 최대 64MiB |
| 압축 해제 합계 | 최대 128MiB |
| 전체 파일 수 | manifest 포함 최대 512개 |
| JSON 한 파일 | 최대 2MiB |
| 이미지 한 파일 | 최대 10MiB, 최대 40,000,000픽셀 |
| 이미지 형식 | PNG, JPEG, WebP, AVIF |
| 파일 무결성 | ZIP 구조·CRC, manifest 목록·바이트 수 일치 |
| 경로 | 허용된 콘텐츠·자산 경로만 사용, 외부·절대·부모 경로 차단 |
| 자료 형식 | Ajv Draft 2020-12와 날짜·URI 형식, R01–R15 관계 검사 |

R01–R15는 ID·slug 중복, 전시 순서, 그래프와 사례 참조, 부모 순환, 이미지 참조, 기간, 외부 주소, 기여 설명, 구조 근거와 공개 선별을 검사한다. 외부 주소의 형식 검사는 실제 접속 가능 여부나 성과의 사실 확인을 뜻하지 않는다.

브라우저에서 4MiB 이상 ZIP 읽기 또는 압축 전 합계 4MiB 이상 쓰기는 Worker를 사용할 수 있는 환경에서 별도 스레드로 처리한다. Worker는 완료·실패·시간 초과 후 종료한다. 작은 파일과 Node 등 Worker가 없는 환경은 공통 ZIP 코어를 사용한다.

## 8. 그래프·3D·미디어 실행 구성

| 기능 | 구성과 실행 원칙 |
| --- | --- |
| 그래프 공통 | `architecture/model.ts`에서 그룹·부모·ID 기반 배치를 계산하고 `session.ts`에서 선택·시점을 관리 |
| 2D 그래프 | SVG 기반, 확대·이동·시스템 선택·키보드 탐색, 계산 결과 재사용 |
| 3D 그래프 | 선택 시 Three.js 지연 로드, 공통 노드·연결·기여 자료 사용 |
| 3D 전시장 | 공통 작품 순서에서 방당 최대 6개 배치, 현재 방의 이미지 준비, 이동 지점·작품 선택·상세 복귀 |
| 렌더러 | 필요한 때 렌더링하고 비활성 문서에서는 프레임 중지, 종료 시 입력·프레임·GPU 자원 해제 |
| 대규모 그래프 | 라벨 atlas, 연결선 묶기, 화살표 인스턴싱, 접힌 편집 항목의 입력 폼 생성 지연 |
| 3D 실패 | 그래프는 2D·시스템 목록, 전시장은 작품 목록·갤러리로 관람 계속 및 재시도 |
| 이미지 | 동일한 불변 Blob의 성공한 검사 재사용, 실패 결과 재시도, 표시 실패 대체 처리 |
| YouTube | 허용 주소·ID 정규화, 재생 요청 후 API·nocookie 플레이어 로드, 화면 종료 시 정리 |
| 공유 | 공개 작품의 공유 주소 복사와 실패 시 주소 직접 선택 |

전시장은 지정된 이동 지점과 시점 조작을 제공하며 자유 보행 게임은 구현하지 않았다. 실제 코드·작성자 설명이 없는 게임 구조를 임의의 예시 그래프로 대체하지 않는다.

## 9. 빌드·공유·배포 구성

### 도구와 주요 버전

`package.json` 기준으로 React 19.3.0, TypeScript 7.0.2, Vite 8.3.3, Three.js 0.180.0, Ajv 8.20.0, fflate 0.8.3을 사용한다. Playwright 1.64.0은 브라우저 검사, sharp 0.35.5는 Node 이미지 디코딩과 공유 이미지 생성에 사용한다. 의존성 설치는 lockfile과 `npm ci`를 기준으로 한다.

Node 지원 조건은 `^20.19.0 || >=22.12.0`이며 CI는 22.23.2를 지정한다.

### 빌드 도구

| 파일 | 역할 |
| --- | --- |
| `scripts/content-files.ts` | 파일 경로·크기·이미지와 공개 패키지 공통 검사 |
| `scripts/import-content.ts` | 공개 ZIP 사전 검사·임시 반영·이전 공개 폴더 보존 |
| `scripts/content-plugin.ts` | Vite 개발 서버·빌드에 검증한 공개 콘텐츠 연결 |
| `scripts/validation-plugin.ts` | Schema에서 브라우저용 standalone 검증 함수 생성 |
| `scripts/sharing.ts` | 사이트·공개 작품별 정적 공유 HTML, Open Graph/Twitter 정보, 1200×630 JPEG 생성 |
| `scripts/check-content.ts` | 배포 입력과 앱 정적 파일 검사 |
| `scripts/check-dist.ts` | 빌드 파일·내용·경로·공유 메타데이터 검사 |
| `scripts/check-performance.ts` | 진입 JS와 정적 import 합계의 초기 크기 예산 검사 |
| `scripts/performance/` | 큰 그래프·이미지·ZIP의 독립 측정 도구 |

작품 상세·전시장·Studio·ZIP·3D 코드는 기능 경계에 따라 지연 로드한다. 초기 JS 예산은 원본 400KiB, gzip 125KiB다.

`PAGES_BASE`로 루트 또는 저장소 하위 경로를 지정한다. `PAGES_URL`에는 HTTPS 공개 주소를 지정할 수 있으며, Actions는 Pages의 실제 `base_path`와 `base_url`을 사용한다. 제작자 이름에서 배포 주소를 추정하지 않는다.

공개 작품마다 `share/<slug>/index.html`을 생성한다. 크롤러는 JavaScript 없이 메타데이터를 읽고 일반 브라우저는 앱의 해당 hash 상세로 이동한다. 공유 주소가 확정되지 않으면 절대 canonical·Open Graph 주소를 추정해 넣지 않는다.

### GitHub Actions

1. push·pull request·수동 실행에서 의존성 설치, 형식·린트·타입, Node 검사와 Chromium 검사를 수행한다.
2. pull request와 기본 브랜치 이외 실행은 로컬 검사용 빌드를 수행한다.
3. 기본 브랜치 실행은 Pages 메타데이터로 빌드하고 `dist/`만 업로드한다.
4. build 성공 후 deploy job이 GitHub Pages에 게시한다.

`dist/`에는 앱 번들, 검증한 공개 자료, 공유 문서·이미지와 기본 정적 파일을 넣는다. 초안 폴더·백업·테스트 예시·검증 도구·legacy·vendor는 공개 빌드 입력에서 제외한다.

## 10. 실행과 검증 명령

| 명령 | 목적 |
| --- | --- |
| `npm ci` | lockfile 기준 의존성 설치 |
| `npm run dev` | 로컬 개발 서버 |
| `npm run check` | Prettier·Oxlint·TypeScript 검사 |
| `npm test` | 도메인·저장·패키지·장면·배포 등 Node 검사 |
| `npx playwright install chromium` | 독립 브라우저 설치 |
| `npm run test:e2e` | 저장 충돌·복구·파일 왕복·관람·공유 등 브라우저 검사 |
| `npm run content:check` | 현재 공개 콘텐츠 검사 |
| `npm run content:import -- "/경로/공개콘텐츠.zip" --check` | 공개 ZIP을 변경 없이 사전 검사 |
| `npm run content:import -- "/경로/공개콘텐츠.zip"` | 검증한 자료를 site-content에 반영 |
| `npm run build` | 콘텐츠 검사 → 타입 검사 → 번들·공유 생성 → dist 검사 → 초기 JS 예산 검사 |
| `npm run preview` | 정적 빌드 로컬 확인 |
| `PAGES_BASE=/Project_IO/ npm run build` | 저장소 하위 경로 빌드 |
| `npm run performance:large` | 큰 그래프·이미지·ZIP 성능 측정 |

브라우저 검사는 사용자 프로필과 분리된 임시 Chromium을 사용한다. 개발 서버 5290·5291을 검사에서 관리하고 루트·`/portfolio/` 경로를 확인한다. 생성 보고서·실패 추적은 `playwright-report/`, `test-results/`에 보관하며 Git에서 제외한다.

## 11. 현재 구현과 남은 운영 작업

갤러리·상세·Studio, 초안 저장·충돌 방지·복구, 백업·공개 ZIP, 이미지·YouTube, 2D·3D 그래프, 3D 전시장, 정적 공유 문서와 Pages 배포 워크플로는 구현되어 있다.

현재 `site-content/`는 공개 작품이 없는 중립적인 빈 템플릿이다. 확인된 개인 프로젝트는 아래 세 개이며 개인 초안과 공개 자료를 구분한다.

| 작품 | 확인된 설명 | 확인된 역할 |
| --- | --- | --- |
| SpaceShipThree | 우주 탐험 게임 | 1인 개발 |
| 난장판! | 모바일 AR 디펜스 게임 | 팀장 |
| Eternal_Steam | 디펜스 게임 | 팀장 |

남은 운영 작업은 공개할 제작자 정보와 작품별 실제 영상·이미지·기술·기여·구조 근거 작성, GitHub 저장소 연결, 실제 Actions·공개 주소·메신저 공유 카드 확인, 친구 계정의 독립 복제·배포 검증이다. 실제 모바일 GPU와 Safari·Firefox 등 다른 브라우저의 성능 확인도 별도로 남아 있다.

이 문서는 소스 구조 확인을 위한 문서다. 기존 테스트 결과와 측정 환경은 [검증 기록](../spec/verification.md)에 있으며, 문서 작성 자체를 새 실행 검증으로 취급하지 않는다.

## 12. 관련 문서

- [기능·운영 기획](./portfolio-plan.md)
- [데이터 계약과 관계 규칙](./data-contract.md)
- [공통 기능 기술 설계](./technical-plan.md)
- [저장·백업·패키지 사용법](./storage-and-packages.md)
- [GitHub Pages 배포와 업데이트](./github-pages-guide.md)
- [구조 평가와 개선 기록](./structure-review.md)
- [작업 상태와 변경 기록](./implementation-plan.md)
- [검증 기록](../spec/verification.md)
