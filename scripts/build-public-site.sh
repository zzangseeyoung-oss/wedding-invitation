#!/usr/bin/env bash
# GitHub Pages 공개 산출물(_site/)을 명시적 허용 목록으로만 만든다.
# 허용 목록에 없는 파일은 절대 공개되지 않는다(새 파일도 기본 비공개).
# 검사 하나라도 실패하면 종료 코드 != 0 → 워크플로가 배포하지 않고 기존 사이트가 그대로 유지된다.
#
# Content guard: 공개 산출물에 들어가면 안 되는 문구 목록은 저장소에 두지 않고
# CI 시크릿 PUBLIC_ARTIFACT_GUARD_TERMS(줄바꿈 구분)로만 받는다. 없으면 실패한다.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
OUT="_site"
SITE_URL="https://zzangseeyoung-oss.github.io/wedding-invitation/"
MIN_TERMS=10

# 공개 허용 목록(런타임 참조를 추적해 정한 것). 파일을 추가로 공개하려면 여기에 적어야 한다.
PUBLIC_FILES=(
  index.html
  styles.css
  script.js
  rsvp.js
  guestbook.js
  dael-rael.js
  firebase-config.js
  admin/attendance.html
  assets/apple-touch-icon.png
  assets/bgm.mp3
  assets/cover-scene-1040.webp
  assets/cover-scene-760.webp
  assets/cover-scene.jpg
  assets/favicon-64.png
  assets/moon-scene-1040.webp
  assets/moon-scene-760.webp
  assets/moon-scene.jpg
  assets/paper-map-1040.webp
  assets/paper-map-760.webp
  assets/paper-map.jpg
  assets/share-card.jpg
  assets/venue-exterior-1040.webp
  assets/venue-exterior-760.webp
  assets/venue-exterior.jpg
)

fail() { echo "BUILD FAILED: $*" >&2; exit 1; }

# 1) 허용 목록만 복사 (추적 중인 일반 파일만, 심볼릭 링크 금지)
rm -rf "$OUT"
mkdir "$OUT"
for f in "${PUBLIC_FILES[@]}"; do
  git ls-files --error-unmatch -- "$f" >/dev/null 2>&1 || fail "not tracked: $f"
  [ -L "$f" ] && fail "symlink not allowed: $f"
  [ -f "$f" ] || fail "missing: $f"
  mkdir -p "$OUT/$(dirname "$f")"
  cp -- "$f" "$OUT/$f"
done

# 2) 산출물 파일 집합 == 허용 목록 (그 외 파일·링크가 섞이면 실패)
actual="$(cd "$OUT" && find . \( -type f -o -type l \) | sed 's|^\./||' | LC_ALL=C sort)"
expected="$(printf '%s\n' "${PUBLIC_FILES[@]}" | LC_ALL=C sort)"
[ "$actual" = "$expected" ] || fail "artifact file set differs from allowlist"

# 3) 참조 검사: 공개 HTML이 가리키는 로컬 파일과 JS의 상대 import가 모두 산출물 안에 있어야 한다
missing=0
check_ref() { # $1 = referring file (relative to OUT), $2 = reference
  local ref="$2" dir target
  ref="${ref%%#*}"; ref="${ref%%\?*}"
  case "$ref" in
    "" | http://* | https://* | //* | mailto:* | tel:* | data:* | javascript:*) return 0 ;;
    /*) echo "absolute path breaks under the Pages base path: $1 -> $ref" >&2; missing=1; return 0 ;;
  esac
  dir="$(dirname "$1")"
  target="$ref"; [ "$dir" != "." ] && target="$dir/$ref"
  target="${target#./}"
  [ -f "$OUT/$target" ] || { echo "missing reference: $1 -> $ref" >&2; missing=1; }
}
while IFS= read -r html; do
  html="${html#./}"
  while IFS= read -r ref; do check_ref "$html" "$ref"; done < <(
    grep -oE '(src|href|poster)="[^"]*"' "$OUT/$html" | sed -E 's/^[a-z]+="//; s/"$//' || true
    grep -oE 'srcset="[^"]*"' "$OUT/$html" | sed -E 's/^srcset="//; s/"$//' | tr ',' '\n' | awk '{print $1}' || true
    grep -oE "content=\"${SITE_URL}[^\"]*\"" "$OUT/$html" | sed -E "s|^content=\"${SITE_URL}||; s/\"$//" || true
  )
done < <(cd "$OUT" && find . -type f -name '*.html')
while IFS= read -r js; do
  js="${js#./}"
  while IFS= read -r ref; do check_ref "$js" "$ref"; done < <(
    grep -oE "(from|import\()[[:space:]]*[\"']\.\.?/[^\"']+" "$OUT/$js" | sed -E "s/^(from|import\()[[:space:]]*[\"']//" || true
  )
done < <(cd "$OUT" && find . -type f -name '*.js')
[ "$missing" -eq 0 ] || fail "unresolved references"

# 4) Content guard (문구는 로그에 절대 출력하지 않는다)
TERMS_FILE="$(mktemp)"
PROBE_FILE="$(mktemp)"
trap 'rm -f "$TERMS_FILE" "$PROBE_FILE"' EXIT
# CR 제거, 앞뒤 공백 제거, 빈 줄 제거
printf '%s\n' "${PUBLIC_ARTIFACT_GUARD_TERMS:-}" | tr -d '\r' | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//' | { grep -v '^$' || true; } > "$TERMS_FILE"
term_count="$(wc -l < "$TERMS_FILE" | tr -d ' ')"
[ "$term_count" -ge "$MIN_TERMS" ] || fail "content guard terms missing or too few ($term_count < $MIN_TERMS); set the CI secret PUBLIC_ARTIFACT_GUARD_TERMS"

# 자체 검사: 목록의 모든 문구가 실제로 걸리는지 확인(목록 손상 시 조용히 통과하는 것 방지)
guard_grep() { LC_ALL=C.UTF-8 grep "$@"; }
while IFS= read -r t; do
  printf 'x %s x\n' "$t" > "$PROBE_FILE"
  set +e; guard_grep -q -i -F -f "$TERMS_FILE" -- "$PROBE_FILE"; rc=$?; set -e
  [ "$rc" -eq 0 ] || fail "content guard self-test failed"
done < "$TERMS_FILE"

set +e
hits="$(guard_grep -r -l -i -F -f "$TERMS_FILE" -- "$OUT")"; rc=$?
set -e
case "$rc" in
  0) echo "content guard hit in:" >&2; echo "$hits" | sed "s|^$OUT/|  |" >&2; fail "content guard" ;;
  1) ;;
  *) fail "content guard scan error (grep rc=$rc)" ;;
esac
set +e
name_hits="$(cd "$OUT" && find . -type f | guard_grep -i -F -f "$TERMS_FILE")"; rc=$?
set -e
case "$rc" in
  0) echo "content guard hit in file names:" >&2; echo "$name_hits" >&2; fail "content guard (file names)" ;;
  1) ;;
  *) fail "content guard name scan error (grep rc=$rc)" ;;
esac

echo "Public site built: $(printf '%s\n' "${PUBLIC_FILES[@]}" | wc -l | tr -d ' ') files in $OUT/ (content guard: $term_count terms, clean)"
