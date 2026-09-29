# syntax=docker/dockerfile:1
# Build context: ./backend   ->  docker build -f backend/api-gateway/Dockerfile backend

FROM golang:1.26-alpine AS build
WORKDIR /src/api-gateway

# Dependency layer (cached until go.mod/go.sum change)
COPY api-gateway/go.mod api-gateway/go.sum /src/api-gateway/
RUN --mount=type=cache,target=/go/pkg/mod go mod download

# Sources
COPY api-gateway/ /src/api-gateway/
# go.mod files in this repo can be incomplete (they rely on go.work locally): complete them
RUN --mount=type=cache,target=/go/pkg/mod go mod tidy
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/api-gateway .

FROM alpine:3.22
RUN apk add --no-cache ca-certificates tzdata \
 && adduser -D -u 10001 app
WORKDIR /app
COPY --from=build /out/api-gateway /app/api-gateway
USER app
ENV GATEWAY_PORT=8080
EXPOSE 8080
ENTRYPOINT ["/app/api-gateway"]
