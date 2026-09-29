# syntax=docker/dockerfile:1
# Build context: ./backend   ->  docker build -f backend/notification-worker/Dockerfile backend

FROM golang:1.26-alpine AS build
WORKDIR /src/notification-worker

# Dependency layer (cached until go.mod/go.sum change)
COPY shared/go.mod shared/go.sum /src/shared/
COPY notification-worker/go.mod notification-worker/go.sum /src/notification-worker/
RUN --mount=type=cache,target=/go/pkg/mod go mod download

# Sources
COPY shared/ /src/shared/
COPY notification-worker/ /src/notification-worker/
# go.mod files in this repo can be incomplete (they rely on go.work locally): complete them
RUN --mount=type=cache,target=/go/pkg/mod go mod tidy
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/notification-worker .

FROM alpine:3.22
RUN apk add --no-cache ca-certificates tzdata \
 && adduser -D -u 10001 app
WORKDIR /app
COPY --from=build /out/notification-worker /app/notification-worker
USER app
ENV SERVER_PORT=8085
EXPOSE 8085
ENTRYPOINT ["/app/notification-worker"]
