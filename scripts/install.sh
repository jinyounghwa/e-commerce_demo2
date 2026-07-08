#!/usr/bin/env bash
# 보안 원칙: postinstall 스크립트 차단 설치 (--ignore-scripts)
# better-sqlite3 만 명시적 빌드 허용
set -euo pipefail

echo ">> npm ci --ignore-scripts (postinstall 차단)"
npm install --ignore-scripts

echo ">> better-sqlite3 네이티브 빌드 허용"
npm rebuild better-sqlite3

echo ">> 설치 완료"
