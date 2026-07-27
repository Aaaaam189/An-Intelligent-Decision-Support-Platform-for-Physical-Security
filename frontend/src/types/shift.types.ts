export interface Shift {
  id: string;
  guardId: string;
  zoneId: string;
  startTime: string;
  endTime: string;
}

export interface CreateShiftRequest {
  guardId: string;
  zoneId: string;
  startTime: string; // ISO 8601
  endTime: string; // ISO 8601
}

export interface CreateShiftBatchRequest {
  zoneId: string;
  startTime: string; // ISO 8601
  endTime: string; // ISO 8601
  guardIds: string[];
}
