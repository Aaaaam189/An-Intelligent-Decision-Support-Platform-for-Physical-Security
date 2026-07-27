export interface Camera {
  id: string;
  name: string;
  zoneId: string;
  location: string;
  isActive: boolean;
  streamUrl: string;
  createdAt: string;
}

export interface CreateCameraRequest {
  name: string;
  zoneId: string;
  location: string;
  streamUrl: string;
}

export interface UpdateCameraRequest {
  name?: string;
  zoneId?: string;
  location?: string;
  isActive?: boolean;
  streamUrl?: string;
}
