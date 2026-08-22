# matdaton-2026

맛다톤 2026 참가팀의 Next.js MVP 저장소입니다.

## 로컬 실행

### 간편 실행

- macOS: Finder에서 `run-local.command`를 더블클릭하거나 터미널에서 `./run-local.command`를 실행합니다.
- Windows: 파일 탐색기에서 `run-local.cmd`를 더블클릭합니다.

실행 파일은 Node.js 20.9 이상이 없으면 설치를 시도하고, `npm ci`로 의존성을 설치한 뒤 개발 서버를 시작합니다. macOS 자동 설치에는 [Homebrew](https://brew.sh), Windows 자동 설치에는 `winget`이 필요합니다.

### 직접 실행

Node.js 20.9 이상을 설치한 뒤 다음 명령을 실행합니다.

```bash
npm ci
npm run dev
```

브라우저에서 <http://localhost:3000>을 엽니다.

## 검증

```bash
npm run typecheck
npm run build
```

`main` 브랜치에 앱 코드가 반영되면 GitHub Actions가 빌드한 standalone 결과물을 Azure App Service에 배포합니다.
