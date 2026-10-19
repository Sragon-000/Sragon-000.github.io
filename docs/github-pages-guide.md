# 전시장 복제와 GitHub Pages 배포

각자 저장소를 복제하고 이름·작품을 편집한 뒤 자기 GitHub Pages 주소에 전시합니다. 앱 코드는 공통이며, 공개할 자료는 `site-content/`에 따로 관리합니다. 기본 템플릿은 제작자 이름을 `제작자`, 제목을 `나의 프로젝트 전시장`으로 표시하고 작품·이미지·구조·연락처는 비워 둡니다.

브라우저 초안 저장, 파일 다운로드, 로컬 콘텐츠 반영과 실제 사이트 배포는 각각 별도 단계입니다. 설정 화면은 이 기기의 편집기이며 GitHub 로그인이나 서버 저장을 제공하지 않습니다.

## 자신의 저장소 만들기

템플릿 운영자는 **개인화하기 전의 빈 기본 파일**로 별도 템플릿 저장소를 유지합니다. 저장소의 Settings에서 **Template repository**를 켜면 친구가 **Use this template → Create a new repository**로 자기 계정의 저장소를 만들 수 있습니다. 기본 브랜치만 복제하면 됩니다. [템플릿 저장소 설정](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-template-repository), [템플릿에서 저장소 만들기](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-repository-from-a-template)

개인 작품을 올린 저장소를 그대로 템플릿으로 나누면 이름·작품·이미지도 함께 복제됩니다. 앱에 다른 사람의 콘텐츠를 제거하는 숨은 기능은 없습니다. 빈 템플릿과 본인의 포트폴리오 저장소를 따로 운영하세요.

| 저장소 이름 예시 | 기본 Pages 주소 예시 | 앱의 base |
| --- | --- | --- |
| `yourname.github.io` | `https://yourname.github.io/` | `/` |
| `portfolio` | `https://yourname.github.io/portfolio/` | `/portfolio/` |

`yourname`은 자기 GitHub 계정명으로 바꿉니다. 워크플로는 `configure-pages`의 실제 `base_path`를 사용하므로 프로필 이름이나 코드의 하드코딩을 바꿀 필요가 없습니다. 사용자 지정 도메인은 별도 DNS·Pages 설정이 필요합니다. [GitHub Pages 사용자와 프로젝트 사이트](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)

## 로컬에서 편집하기

자기 저장소를 컴퓨터로 복제하고 그 폴더에서 실행합니다. 검증한 Node 버전은 **22.23.2**이며 빌드 워크플로도 같은 버전을 사용합니다.

```sh
npm ci
npm run dev
```

터미널의 주소에서 `#/studio/profile`을 열어 제작자 소개와 전시장 이름을 입력합니다. `#/studio/projects`에서 작품·영상·이미지·기여를 작성하고 공개 대상을 선택합니다. `#/studio/presentation`에서 테마와 첫 관람 화면을 정합니다. 그래프는 실제 코드나 설명에 근거한 구조를 입력하고 확인한 경우에만 공개합니다.

초안을 저장하고 **공개 대상 미리보기**에서 확인한 뒤 **전체 초안 백업**과 **공개 콘텐츠 ZIP**을 각각 다운로드합니다. 전체 백업은 비공개 보관 위치에 둡니다. 다른 브라우저나 개발·배포 주소로 옮길 때에는 백업 또는 공개 ZIP을 가져와야 하며 기존 초안을 교체하기 전 확인 화면을 거칩니다.

이미 게시한 사이트에서 설정 화면을 처음 열어도 공개 자료를 자동으로 초안에 덮어쓰지 않습니다. 기존 내용을 편집하려면 본인이 보관한 백업이나 마지막 공개 ZIP을 가져오세요.

## 공개 파일 반영과 확인

다운로드한 **공개 콘텐츠 ZIP**의 실제 파일 경로로 아래 예시를 바꿉니다. 공백이 있으면 따옴표를 유지합니다.

```sh
npm run content:import -- "/경로/io-public-content.zip" --check
npm run content:import -- "/경로/io-public-content.zip"
npm test
npm run build
npm run preview
```

`--check`는 ZIP만 검사하고 파일을 바꾸지 않습니다. 반영 명령은 버전·파일 목록·바이트 수·공개 필수값·관계·실제 이미지와 픽셀 크기까지 검사한 뒤 `site-content/` 전체를 교체합니다. 제거한 작품과 이미지는 새 출력에서 제외합니다. 성공하면 이전 폴더를 `.site-content-backup-.../`에 보존하고 경로를 표시합니다. 이 폴더와 ZIP은 `.gitignore`로 제외합니다. 반영 실패 시 기존 자료를 유지하며, 기존 폴더가 손상됐거나 링크이면 자동 교체하지 않습니다.

빌드의 이미지 검사는 PNG·JPEG·WebP·AVIF를 실제 디코딩하며 EXIF 회전을 적용합니다. 한 이미지 10MiB와 **4천만 픽셀 이하**를 지원합니다. 브라우저에서 등록한 이미지라도 이 한도를 넘으면 크기를 줄여 다시 등록해야 합니다.

자료는 `site-content/content/`, 이미지는 `site-content/assets/`, 파일 목록은 `site-content/export-manifest.json`에 위치합니다. 이들은 저장소에 커밋할 공개 자료입니다. `public/`은 기본 아이콘·Three.js 라이선스·`.nojekyll`만 포함하며 초안이나 임의 파일을 넣으면 빌드 검사가 실패합니다. 기본 아이콘을 바꾸려면 전시 설정에서 이미지 아이콘을 등록하거나 기존 `public/favicon.svg`를 수정합니다.

실행 중인 개발 서버에는 시작 시 읽은 공개 자료가 표시됩니다. 새 ZIP을 반영한 뒤에는 서버를 종료하고 `npm run dev`를 다시 실행합니다. `npm run preview`는 마지막 `dist`를 보여주므로 항상 먼저 빌드합니다.

저장소 하위 경로는 다음과 같이 로컬에서 미리 확인할 수 있습니다.

```sh
PAGES_BASE=/portfolio/ npm run build
PAGES_BASE=/portfolio/ npm run preview
```

위의 환경 변수 문법은 macOS·Linux용입니다. PowerShell에서는 먼저 `$env:PAGES_BASE='/portfolio/'`를 설정하고 명령을 실행하며, 루트로 돌아갈 때는 `Remove-Item Env:PAGES_BASE`로 지웁니다. Vite는 TypeScript 설정의 호환성을 위해 `configLoader runner`를 사용합니다.

## GitHub에 배포하기

자기 저장소의 **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 선택합니다. 제공된 [워크플로](../.github/workflows/pages.yml)는 기본 브랜치의 push 또는 기본 브랜치에서 실행한 수동 요청에서만 배포합니다. 다른 브랜치와 pull request에서는 검사·빌드만 수행합니다. 새 저장소의 첫 실행이 Pages 설정 전 실패했다면 설정 후 Actions에서 워크플로를 다시 실행합니다. [GitHub Pages 사용자 지정 워크플로](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

로컬 확인을 마친 `site-content/` 변경을 커밋해 기본 브랜치에 push합니다. 삭제 파일도 함께 반영해야 하므로 공개 자료 변경은 다음처럼 스테이징할 수 있습니다.

```sh
git add -A -- site-content
git commit -m "Update exhibition content"
git push
```

처음 소스를 올릴 때는 앱 코드와 `.github/workflows/pages.yml`, `package-lock.json`도 자기 저장소에 포함되어 있어야 합니다. `dist/`를 소스 브랜치에 올릴 필요는 없습니다.

Actions의 **Validate and deploy portfolio**에서 검사·빌드·deploy 결과를 확인하고, 배포 결과의 **github-pages 주소**를 엽니다. 검사 실패는 배포를 막습니다. 빌드 성공만으로 공개 완료라고 판단하지 않고 실제 주소에서 아래 항목을 확인합니다.

- 본인 이름과 작품만 표시되고 이미지·영상·외부 링크가 맞는지
- 작품 상세 주소를 직접 열고 새로고침해도 같은 작품을 읽는지
- 2D·3D 그래프와 전시장 이동·상세 복귀가 되는지
- 모바일에서 작품과 목록에 접근할 수 있는지

## 콘텐츠를 보존하며 업데이트하기

앱 버전은 `package.json`, 데이터 버전은 `schemaVersion: 1.0.0`, ZIP 버전은 `exportVersion: 1.0.0`입니다. 지원하지 않는 버전은 검사에서 거부하며 자동 변환하거나 값만 바꾸지 않습니다. 형식이 바뀌는 업데이트에는 별도의 변환 안내가 필요합니다.

업데이트 전 전체 초안 백업, 마지막 공개 ZIP과 현재 저장소 커밋을 보관합니다. 새 버전의 `src/`, `scripts/`, 워크플로와 빌드 설정·의존성·명세를 함께 검토해 반영하되, 자기 `site-content/`와 사용자 지정 Pages 설정은 보존합니다. 특히 템플릿의 빈 `site-content/`를 개인 자료 위에 복사하지 않습니다.

템플릿으로 만든 저장소는 독립된 이력으로 시작합니다. 일반 업데이트 때 `git pull`로 템플릿 이력을 합치거나 무조건 전체 파일을 교체하지 않고, 새 버전과의 변경을 검토한 업데이트 브랜치에서 적용하세요. 형식 검사 → 자동 검사 → 빌드 → 로컬 관람을 확인하고 기본 브랜치에 반영합니다. [템플릿과 fork의 차이](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-repository-from-a-template)

문제가 생기면 마지막 정상 공개 ZIP을 같은 반영 명령으로 되돌리거나 보존한 커밋으로 복구해 다시 배포할 수 있습니다. 로컬 반영 도구가 남긴 이전 공개 폴더도 복구 자료이므로 필요가 없어질 때까지 보관하세요.

## 문제 해결

| 증상 | 확인할 내용 |
| --- | --- |
| 아직 빈 전시장으로 표시됨 | 공개 ZIP을 반영했는지, `site-content/` 변경이 push됐는지, 배포가 성공했는지 |
| 로컬에서 반영 전 자료가 보임 | 개발 서버 재시작 또는 다시 빌드 후 preview |
| ZIP 반영 실패 | 공개 콘텐츠 ZIP인지, 버전·오류 원문·파일/이미지 누락을 확인 |
| Pages 설정 단계 실패 | Source가 GitHub Actions인지, 저장소에서 Actions와 Pages를 사용할 수 있는지 |
| HTML은 열리는데 앱·이미지가 404 | 수동 base 대신 Pages 메타데이터 사용 여부, build 로그의 경로, 이전 파일과 새 파일 혼합 여부 |
| 새 이름을 입력해도 공개 사이트가 그대로 | 초안 저장과 실제 배포는 별도이며 공개 ZIP 반영·push·배포까지 진행해야 함 |

2026-10-19 [Sragon-000.github.io](https://sragon-000.github.io/)에서 GitHub Actions 검사·빌드·배포와 공개 갤러리·편집 화면 직접 접근 및 새로고침을 확인했습니다. 현재 공개 작품은 0개입니다. 다른 계정의 독립 배포와 실제 프로젝트 영상·구조는 별도 확인 대상입니다.


## 공유 링크 미리보기

공유 정보는 반영한 site-content의 공개 설정과 작품에서 빌드 때 생성한다. 전시장 제목·제작자 이름·설명과 작품의 제목·요약·대표 이미지를 편집하고, 공개 ZIP을 반영해 다시 배포하면 공유 정보도 갱신된다. 대표 이미지가 없으면 이름과 제목으로 카드를 만든다. 공개 빌드에만 표시되는 **전시장 링크 복사 / 작품 링크 복사**를 사용한다. 클립보드를 거부한 브라우저에는 선택해 복사할 주소를 표시한다.

작품 공유 주소는 `/share/<slug>/`다. 해당 HTML의 메타데이터는 JavaScript를 실행하지 않아도 읽을 수 있으며, 일반 브라우저에서는 기존 작품 상세로 이동한다. 기존 `#/projects/<slug>` 주소는 계속 동작하지만 해시는 서버 요청에 포함되지 않으므로 작품별 미리보기에는 새 공유 주소를 사용한다. [URI fragment](https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Fragment)

기본 Pages 워크플로는 configure-pages의 실제 `base_url`을 PAGES_URL로 넘긴다. 따라서 계정이나 저장소 이름을 코드에서 추정하지 않으며 사용자 지정 도메인도 Pages 설정 주소를 따른다. 로컬에서는 PAGES_BASE와 같은 경로의 실제 HTTPS 주소를 PAGES_URL로 지정할 수 있다. 두 경로가 다르거나 인증정보·쿼리·해시가 포함되면 빌드가 실패한다. URL이 없으면 잘못된 canonical 주소를 만들지 않고 생략한다. [configure-pages 출력](https://github.com/actions/configure-pages/blob/main/action.yml)

공유 이미지는 JPEG 1200×630이며 Open Graph의 제목·설명·이미지·URL과 이미지 타입/크기/대체 설명을 포함한다. [Open Graph protocol](https://ogp.me/) 실제 카카오톡·Discord·SNS 카드의 모양과 갱신 시점은 각 서비스의 캐시에 영향을 받는다. 공개 배포 후 실제 주소로 확인하고, 예전 정보가 남으면 서비스의 갱신 도구나 캐시 만료 후 다시 확인한다. 실제 공개 HTML의 Open Graph·canonical 주소와 JPEG 1200×630 카드 응답은 확인했다. 카카오톡·Discord 등 실제 메신저의 카드 표시는 아직 확인하지 않았다.

Linux 로컬 빌드에서 한국어 글자가 네모로 나오면 Noto CJK 글꼴을 설치한다. Ubuntu CI는 `fonts-noto-cjk`를 설치하며 macOS에서는 시스템 한국어 글꼴을 사용한다. 공개 카드와 공유 HTML은 dist에 생성하고 site-content의 원본 파일/manifest 및 백업에는 추가하지 않는다.
