# syntax=docker/dockerfile:1
# Build context: ./backend   ->  docker build -f backend/camera-service/Dockerfile backend

FROM golang:1.26-alpine AS build
WORKDIR /src/camera-service

# Dependency layer (cached until go.mod/go.sum change)
COPY shared/go.mod shared/go.sum /src/shared/
COPY camera-service/go.mod camera-service/go.sum /src/camera-service/
RUN --mount=type=cache,target=/go/pkg/mod go mod download

# Sources
COPY shared/ /src/shared/
COPY camera-service/ /src/camera-service/
# go.mod here doesn't declare sentinelai/shared (it only builds via the repo's go.work)
RUN go mod edit -require=sentinelai/shared@v0.0.0 -replace=sentinelai/shared=../shared \
 && go mod tidy
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/camera-service .

FROM alpine:3.22
RUN apk add --no-cache ca-certificates tzdata \
 && adduser -D -u 10001 app
WORKDIR /app
COPY --from=build /out/camera-service /app/camera-service
USER app
ENV SERVER_PORT=8082
EXPOSE 8082
ENTRYPOINT ["/app/camera-service"]
