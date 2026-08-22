#!/bin/bash

set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1 || ! node -e "process.exit(process.versions.node.localeCompare('20.9.0', undefined, { numeric: true }) >= 0 ? 0 : 1)"; then
  if ! command -v brew >/dev/null 2>&1; then
    echo "Node.js 20.9 이상이 필요합니다. Homebrew를 먼저 설치해 주세요:"
    echo "https://brew.sh"
    read -r -p "Enter를 누르면 종료합니다."
    exit 1
  fi

  echo "Node.js를 설치합니다..."
  brew install node
  export PATH="$(brew --prefix node)/bin:$PATH"
fi

echo "Node.js $(node --version), npm $(npm --version)"
echo "의존성을 설치합니다..."
npm ci

echo "개발 서버를 시작합니다: http://localhost:3000"
npm run dev