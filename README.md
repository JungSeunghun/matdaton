# matdaton-2026

맛다톤 2026 참가팀의 Next.js MVP 저장소입니다.

## 로컬 실행

```bash
npm install
npm run dev
```

브라우저에서 <http://localhost:3000>을 엽니다.

## 검증

```bash
npm run typecheck
npm run build
```

`main` 브랜치에 앱 코드가 반영되면 GitHub Actions가 빌드한 standalone 결과물을 Azure App Service에 배포합니다.
