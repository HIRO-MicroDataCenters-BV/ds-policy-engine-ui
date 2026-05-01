#!/usr/bin/env bash

set -o errexit
set -o nounset

# Default to the current repo root when run outside GitHub Actions
# (local debugging, etc). GITHUB_WORKSPACE is always set in CI.
ROOT="${GITHUB_WORKSPACE:-$(pwd)}"
CHART_NAME="ds-policy-engine-ui"
CHART_PATH_PREFIX="./charts"

VERSION_APP_PATH="./VERSION_APP"
VERSION_CHART_PATH="./VERSION_CHART"
VERSION_DOCKER_PATH="./VERSION_DOCKER"
DOCKER_IMAGES_PATH="./DOCKER_IMAGES"

make_version() {
  GIT_SHA=$(git log -1 --pretty=%H)
  SHORT_SHA=$(echo "$GIT_SHA" | cut -c1-8)

  VERSION_BASE_HASH=$(git log --follow -1 --pretty=%H VERSION)
  VERSION_BASE=$(cat VERSION)
  GIT_COUNT=$(git rev-list --count "$VERSION_BASE_HASH"..HEAD)

  BRANCH=${GITHUB_HEAD_REF:-${GITHUB_REF##*/}}
  TAG=$( [[ $GITHUB_REF == refs/tags/* ]] && echo "${GITHUB_REF##refs/tags/}" || echo "" )

  echo "GIT_SHA: $GIT_SHA"
  echo "SHORT_SHA: $SHORT_SHA"
  echo "BRANCH: $BRANCH"
  echo "TAG: $TAG"
  echo "VERSION_BASE: $VERSION_BASE"
  echo "GIT_COUNT: $GIT_COUNT"

  if [[ "$TAG" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    VERSION_APP="$TAG"
    VERSION_CHART="$TAG"
    VERSION_DOCKER="$TAG,${TAG}-${SHORT_SHA}"
  else
    BRANCH_TOKEN=$(echo "${BRANCH//[^a-zA-Z0-9-_.]/-}" | cut -c1-16 | sed -e 's/-$//')
    VERSION_APP="$VERSION_BASE+dev${GIT_COUNT}-${BRANCH_TOKEN}-${SHORT_SHA}"
    VERSION_CHART="$VERSION_BASE-dev.${GIT_COUNT}.${BRANCH_TOKEN}.${SHORT_SHA}"
    VERSION_DOCKER="$VERSION_CHART"
  fi

  echo "APP VERSION: ${VERSION_APP}"
  echo "CHART VERSION: ${VERSION_CHART}"
  echo "DOCKER VERSIONS: ${VERSION_DOCKER}"

  echo -n "${VERSION_APP}"   > "${VERSION_APP_PATH}"
  echo -n "${VERSION_DOCKER}" > "${VERSION_DOCKER_PATH}"
  echo -n "${VERSION_CHART}"  > "${VERSION_CHART_PATH}"
}

make_docker_images_with_tags() {
  DOCKER_IMAGE_NAME="$1"
  DOCKER_IMAGE_TAGS=$(cat "${VERSION_DOCKER_PATH}")

  IFS=',' read -ra TAGS_ARRAY <<< "$DOCKER_IMAGE_TAGS"

  RESULT=""
  for TAG in "${TAGS_ARRAY[@]}"; do
    RESULT+="${DOCKER_IMAGE_NAME}:${TAG},"
  done

  RESULT=${RESULT%,}

  echo "DOCKER IMAGES WITH TAGS: ${RESULT}"
  echo -n "${RESULT}" > "${DOCKER_IMAGES_PATH}"
}

patch_helm_chart() {
  DOCKER_IMAGE_NAME="$1"
  CHART_PATH="${CHART_PATH_PREFIX}/${CHART_NAME}"

  DOCKER_IMAGE_TAG=$(rev "${VERSION_DOCKER_PATH}" | cut -d ',' -f 1 | rev)
  VERSION_CHART=$(cat "${VERSION_CHART_PATH}")

  sed -i "s#repository: \"\"#repository: \"$DOCKER_IMAGE_NAME\"#" "${CHART_PATH}/values.yaml"
  sed -i "s#tag: \"\"#tag: \"$DOCKER_IMAGE_TAG\"#" "${CHART_PATH}/values.yaml"
  sed -i "s#version: \"0.0.0\"#version: \"$VERSION_CHART\"#" "${CHART_PATH}/Chart.yaml"
  sed -i "s#appVersion: \"0.0.0\"#appVersion: \"$VERSION_CHART\"#" "${CHART_PATH}/Chart.yaml"
}

main() {
  DOCKER_IMAGE_NAME="$1"
  cd "$ROOT"
  make_version
  make_docker_images_with_tags "$DOCKER_IMAGE_NAME"
  patch_helm_chart "$DOCKER_IMAGE_NAME"
}

main "$@"
