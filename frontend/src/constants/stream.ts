// Base URL of the ai-service MJPEG server, which streams each camera's
// annotated frames (with detection bounding boxes drawn) at
// `${AI_STREAM_BASE_URL}/stream/<cameraId>`.
//
// Overridable via VITE_AI_STREAM_BASE_URL so the docker-compose build can point
// at the compose service host instead of localhost.
export const AI_STREAM_BASE_URL =
  import.meta.env.VITE_AI_STREAM_BASE_URL || "http://localhost:8091";

// Build the annotated MJPEG stream URL for a given camera id.
export function cameraStreamUrl(cameraId: string): string {
  return `${AI_STREAM_BASE_URL}/stream/${cameraId}`;
}
