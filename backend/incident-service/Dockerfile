# syntax=docker/dockerfile:1
# Build context: ./backend   ->  docker build -f backend/incident-service/Dockerfile backend

FROM golang:1.26-alpine AS build
WORKDIR /src/incident-service

# Dependency layer (cached until go.mod/go.sum change)
COPY shared/go.mod shared/go.sum /src/shared/
COPY incident-service/go.mod incident-service/go.sum /src/incident-service/
RUN --mount=type=cache,target=/go/pkg/mod go mod download

# Sources
COPY shared/ /src/shared/
COPY incident-service/ /src/incident-service/
# go.mod files in this repo can be incomplete (they rely on go.work locally): complete them
RUN --mount=type=cache,target=/go/pkg/mod go mod tidy
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/incident-service .

FROM alpine:3.22
RUN apk add --no-cache ca-certificates tzdata \
 && adduser -D -u 10001 app
WORKDIR /app
COPY --from=build /out/incident-service /app/incident-service
USER app
ENV SERVER_PORT=8083
EXPOSE 8083
ENTRYPOINT ["/app/incident-service"]
