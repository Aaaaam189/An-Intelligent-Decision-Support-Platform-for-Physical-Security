# syntax=docker/dockerfile:1
# Build context: ./backend   ->  docker build -f backend/decision-engine/Dockerfile backend

FROM golang:1.26-alpine AS build
WORKDIR /src/decision-engine

# Dependency layer (cached until go.mod/go.sum change)
COPY shared/go.mod shared/go.sum /src/shared/
COPY decision-engine/go.mod decision-engine/go.sum /src/decision-engine/
RUN --mount=type=cache,target=/go/pkg/mod go mod download

# Sources
COPY shared/ /src/shared/
COPY decision-engine/ /src/decision-engine/
# go.mod files in this repo can be incomplete (they rely on go.work locally): complete them
RUN --mount=type=cache,target=/go/pkg/mod go mod tidy
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/decision-engine .

FROM alpine:3.22
RUN apk add --no-cache ca-certificates tzdata \
 && adduser -D -u 10001 app
WORKDIR /app
COPY --from=build /out/decision-engine /app/decision-engine
USER app
ENTRYPOINT ["/app/decision-engine"]
