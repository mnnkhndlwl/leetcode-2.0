#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Load credentials from .env ────────────────────────────────────────────────
# Exports AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY so the aws CLI uses them
# instead of whatever profile is configured in ~/.aws/credentials
if [[ -f "$SCRIPT_DIR/.env" ]]; then
    echo "Loading credentials from .env..."
    set -a                        # auto-export every variable that follows
    # shellcheck disable=SC1091
    source "$SCRIPT_DIR/.env"
    set +a
else
    echo "No .env found — using existing environment / AWS profile"
fi

# Validate that credentials are actually present
if [[ -z "${AWS_ACCESS_KEY_ID:-}" || -z "${AWS_SECRET_ACCESS_KEY:-}" ]]; then
    echo "ERROR: AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY are not set."
    echo "  Add them to judge-worker/.env or export them before running this script."
    exit 1
fi

# ── Config (override via env vars) ────────────────────────────────────────────
AWS_REGION="${AWS_REGION:-ap-south-1}"
ECR_REPO="${ECR_REPO:-judge}"
PLATFORM="${PLATFORM:-linux/amd64}"
LANGUAGES=(python3 javascript cpp java go)

# ── Resolve account ID + registry ─────────────────────────────────────────────
echo "Resolving AWS account..."
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

echo "Registry : $ECR_REGISTRY"
echo "Repo     : $ECR_REPO"
echo "Region   : $AWS_REGION"
echo "Platform : $PLATFORM"
echo ""

# ── ECR login ─────────────────────────────────────────────────────────────────
echo "Logging into ECR..."
aws ecr get-login-password --region "$AWS_REGION" | \
    docker login --username AWS --password-stdin "$ECR_REGISTRY"

# ── Create ECR repo if it doesn't exist ───────────────────────────────────────
if ! aws ecr describe-repositories \
        --repository-names "$ECR_REPO" \
        --region "$AWS_REGION" &>/dev/null; then
    echo "Creating ECR repository: $ECR_REPO"
    aws ecr create-repository \
        --repository-name "$ECR_REPO" \
        --region "$AWS_REGION" \
        --image-scanning-configuration scanOnPush=true
fi

# ── Build + push each language image ──────────────────────────────────────────
FAILED=()

for LANG in "${LANGUAGES[@]}"; do
    IMAGE_DIR="$SCRIPT_DIR/images/$LANG"
    LOCAL_TAG="judge-${LANG}:latest"
    ECR_TAG="${ECR_REGISTRY}/${ECR_REPO}:${LANG}"

    echo ""
    echo "┌── $LANG ──────────────────────────────────────────"
    echo "│  dir : $IMAGE_DIR"
    echo "│  ecr : $ECR_TAG"

    if ! docker build \
            --platform "$PLATFORM" \
            --tag "$LOCAL_TAG" \
            --tag "$ECR_TAG" \
            "$IMAGE_DIR"; then
        echo "│  ✗ build failed"
        FAILED+=("$LANG")
        continue
    fi

    if ! docker push "$ECR_TAG"; then
        echo "│  ✗ push failed"
        FAILED+=("$LANG")
        continue
    fi

    echo "│  ✓ pushed"
    echo "└───────────────────────────────────────────────────"
done

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════"
if [ ${#FAILED[@]} -eq 0 ]; then
    echo "All images pushed successfully."
else
    echo "Failed: ${FAILED[*]}"
    echo "Re-run to retry failed languages."
fi

echo ""
echo "Add to your judge-worker .env:"
echo "  IMAGE_REGISTRY=${ECR_REGISTRY}"
echo ""
echo "Images available:"
for LANG in "${LANGUAGES[@]}"; do
    echo "  ${ECR_REGISTRY}/${ECR_REPO}:${LANG}"
done
