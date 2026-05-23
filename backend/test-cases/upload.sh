#!/usr/bin/env bash
# Upload test case files to S3 and update testCasesFileUrl in the DB.
#
# Usage:
#   ./test-cases/upload.sh                  # upload all problems
#   ./test-cases/upload.sh two-sum          # upload one problem
#
# Requires: aws CLI configured, DATABASE_URL in env or .env

set -euo pipefail

# Load .env if present
if [ -f "$(dirname "$0")/../.env" ]; then
  export $(grep -v '^#' "$(dirname "$0")/../.env" | xargs)
fi

BUCKET="${TEST_CASES_S3_BUCKET:?TEST_CASES_S3_BUCKET is not set}"
REGION="${AWS_REGION:-ap-south-1}"
DB="${DATABASE_URL:?DATABASE_URL is not set}"
DIR="$(dirname "$0")"

upload_problem() {
  local slug="$1"
  local file="$DIR/$slug/cases.json"
  local s3_key="test-cases/$slug/cases.json"

  if [ ! -f "$file" ]; then
    echo "  [skip] $file not found"
    return
  fi

  echo "  [upload] s3://$BUCKET/$s3_key"
  aws s3 cp "$file" "s3://$BUCKET/$s3_key" \
    --region "$REGION" \
    --content-type "application/json"

  echo "  [db]     updating testCasesFileUrl for slug=$slug"
  psql "$DB" -c \
    "UPDATE problems SET \"testCasesFileUrl\" = '$s3_key', \"updatedAt\" = NOW() WHERE slug = '$slug';"
}

if [ $# -eq 1 ]; then
  # Single problem
  upload_problem "$1"
else
  # All problem directories
  for dir in "$DIR"/*/; do
    slug=$(basename "$dir")
    upload_problem "$slug"
  done
fi

echo "Done."
