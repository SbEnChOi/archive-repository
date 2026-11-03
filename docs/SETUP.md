# 실행과 배포

[README](../README.md) · [사용 가이드](GUIDE.md)

## 로컬 실행

Node.js 22 이상에서 실행한다.

```sh
npm ci
npm start
```

`http://127.0.0.1:4179`를 연다. 운영용 환경변수 없이 실행할 수 있다. 최초 실행 시 예시 기록과 PDF가 만들어지고 `data/`에 기록·파일·로컬 관리 키가 저장된다. 이 폴더를 공개 저장소에 넣지 않는다. 로컬 관리 세션은 로컬판에서만 사용한다.

```sh
npm run build
npm test
```

로컬 빌드는 `web/`의 실행 파일과 `output/preview.html`을 생성한다. `web/repository-adapter.js`만 수기 원본이며 다른 생성 파일은 직접 편집하지 않는다. 미리보기 조각은 실제 저장 서버를 연결하지 않으므로 실행 사이트와 동일한 저장 기능을 제공하지 않는다.

다른 포트와 데이터 폴더는 `ARCHIVE_PORT`, `ARCHIVE_DATA_DIR`로 지정한다. 예를 들어 PowerShell에서는 다음처럼 실행한다.

```powershell
$env:ARCHIVE_PORT='4186'
$env:ARCHIVE_DATA_DIR=Join-Path (Get-Location) 'output/local-check-data'
npm start
```

## Supabase 준비

운영판은 별도 Supabase 프로젝트가 필요하다. 아래 과정은 **새 프로젝트**를 기준으로 하며, 기존 운영 DB에 초기 마이그레이션을 다시 실행하지 않는다.

1. 새 프로젝트를 만들고 `supabase/migrations/202610210001_archive_repository.sql`을 적용한다.
2. 서버 전용 `archive_config`의 관리자 이메일, 사이트 주소, 허용 출처를 자신의 값으로 정한다.
3. Auth의 Site URL과 Redirect URLs에 운영 사이트와 `/auth/callback` 주소를 등록한다.
4. Edge Function `archive-api`를 배포한다.

초기 마이그레이션의 `owner@example.com`은 예시다. 새 프로젝트에서 다음 값을 교체한다.

```sql
update public.archive_config
set owner_email = 'YOUR_ADMIN_EMAIL',
    site_url = 'https://YOUR_SITE.vercel.app',
    origins = '["https://YOUR_SITE.vercel.app"]'::jsonb
where singleton = true;
```

Supabase CLI를 사용하는 경우 프로젝트 연결과 마이그레이션을 확인한 뒤 함수를 배포한다.

```sh
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
supabase functions deploy archive-api --no-verify-jwt
```

플랫폼 JWT 검사는 꺼져 있지만 함수 내부에서 Auth 사용자와 관리자 이메일, 허용 출처, 공유 링크를 확인한다. 익명 방문자의 공개 기록 열람을 허용하기 위한 구성이다. DB 테이블과 버킷을 공개로 바꾸는 방식으로 대신하지 않는다.

함수의 `SUPABASE_URL`과 `SUPABASE_SERVICE_ROLE_KEY`는 서버 런타임에서만 사용한다. 서비스 역할 키를 프런트엔드 설정이나 GitHub에 넣지 않는다. 프로젝트의 현재 CLI·Auth 설정은 [Supabase 문서](https://supabase.com/docs)를 확인한다.

## 클라우드 프런트엔드 빌드

`.env.example`을 `.env.cloud`로 복사하고 두 공개 설정을 넣는다.

```dotenv
ARCHIVE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
ARCHIVE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

```sh
npm run build:cloud
```

결과는 `dist/`다. 공개 URL과 publishable/anon 키만 브라우저 번들에 포함된다. 서비스 역할 키를 넣으면 빌드가 거부된다. `.env.cloud` 자체는 Git에 올리지 않는다.

## Vercel 배포

GitHub에 소스를 올리는 것과 운영 배포는 별도 작업이다. 이 저장소 공개만으로 기존 Vercel 프로젝트를 Git 자동 배포에 연결하지 않는다.

기존 방식대로 정적 결과물을 CLI로 배포하려면 다음을 사용한다.

```sh
vercel login
vercel link --cwd dist --project YOUR_VERCEL_PROJECT
vercel deploy --cwd dist --prod
```

또는 Vercel에 GitHub 저장소를 연결하고 다음 빌드 설정을 사용한다.

- Framework: Other
- Install: `npm ci`
- Build: `npm run build:cloud`
- Output: `dist`
- 환경변수: `ARCHIVE_SUPABASE_URL`, `ARCHIVE_SUPABASE_PUBLISHABLE_KEY`

Supabase의 함수·DB는 프런트엔드와 별도로 배포한다. 도메인이 바뀌면 `archive_config`, Auth 리다이렉트 허용 주소도 함께 확인한다. Vercel 계정·팀과 프로젝트 선택은 자신의 계정을 사용한다. [Vercel 문서](https://vercel.com/docs)

## 확인 순서

1. 로컬에서 `npm test`와 빌드가 통과하는지 확인한다.
2. 공개 방문자로 공개 기록만 보이는지 확인한다.
3. 관리자 로그인으로 추가·수정·파일 열람을 확인한다.
4. 비공개 및 일부 공개 링크를 다른 로그인 상태에서 확인한다.
5. README·PDF·Office 첨부, 폴더 이동과 모바일 화면을 확인한다.

운영 기록을 시험용 데이터로 덮어쓰지 않는다. 자동 테스트나 예시 데이터 실행이 운영 데이터 이전을 뜻하지 않는다. `tools/export-cloud-import.cjs`는 로컬 원본과 공유 정보를 포함하는 이전 자료를 `output/`에 만들므로 결과를 공개 저장소에 넣지 않는다.

## 제한과 문제 해결

- 외부 사이트가 내부 보기에서 로그인되지 않으면 링크 열기를 새 탭으로 바꾼다.
- 오래 열린 관리자 탭의 파일이 만료되면 새로고침해 티켓을 갱신한다.
- 저장 버전 충돌은 최신 내용이 있다는 뜻이다. 작성 중인 내용을 보관한 뒤 최신 기록을 확인한다.
- 업로드 합계는 50 MB다. 프런트엔드 숫자만 바꿔 Storage 요금제의 제한을 넘길 수는 없다.
- Office 미리보기와 편집은 지원 범위가 다르다. 자세한 내용은 사용 가이드를 따른다.
