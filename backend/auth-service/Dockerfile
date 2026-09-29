# syntax=docker/dockerfile:1
# Build context: ./backend   ->  docker build -f backend/auth-service/Dockerfile backend

FROM golang:1.26-alpine AS build
WORKDIR /src/auth-service

# Dependency layer (cached until go.mod/go.sum change)
COPY auth-service/go.mod auth-service/go.sum /src/auth-service/
RUN --mount=type=cache,target=/go/pkg/mod go mod download

# Sources
COPY auth-service/ /src/auth-service/
# go.mod files in this repo can be incomplete (they rely on go.work locally): complete them
RUN --mount=type=cache,target=/go/pkg/mod go mod tidy
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/auth-service .

FROM alpine:3.22
RUN apk add --no-cache ca-certificates tzdata \
 && adduser -D -u 10001 app
WORKDIR /app
COPY --from=build /out/auth-service /app/auth-service
USER app
ENV SERVER_PORT=8081
EXPOSE 8081
ENTRYPOINT ["/app/auth-service"]
