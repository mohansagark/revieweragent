#!/usr/bin/env bash
# Delete refs/heads/$HEAD_REF. HTTP 204 = deleted; 404 and 422 = already gone.
set -euo pipefail

classify_github_delete_status() {
  case "$1" in
    204)
      echo "deleted"
      return 0
      ;;
    404 | 422)
      echo "already-gone"
      return 0
      ;;
    *)
      echo "failed" >&2
      return 1
      ;;
  esac
}

if [ "${1:-}" = "--classify" ]; then
  classify_github_delete_status "${2:?http status required}"
  exit $?
fi

: "${HEAD_REF:?HEAD_REF is required}"
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
: "${GH_TOKEN:?GH_TOKEN is required}"

if [ "$HEAD_REF" = "${DEFAULT_BRANCH:-}" ]; then
  echo "refusing to delete default branch ${HEAD_REF}"
  exit 0
fi

enc="$(python3 -c "import urllib.parse, os; print(urllib.parse.quote(os.environ['HEAD_REF'], safe='/'))")"
body="$(mktemp)"
trap 'rm -f "$body"' EXIT

code="$(
  curl -sS -o "$body" -w '%{http_code}' \
    -X DELETE \
    -H "Authorization: Bearer ${GH_TOKEN}" \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    "https://api.github.com/repos/${GITHUB_REPOSITORY}/git/refs/heads/${enc}"
)"

if classify_github_delete_status "$code"; then
  echo "HTTP ${code} for ${HEAD_REF}"
  exit 0
fi
echo "Delete failed HTTP ${code}" >&2
cat "$body" >&2
exit 1
