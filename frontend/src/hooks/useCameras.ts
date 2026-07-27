import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import {
  getCameras,
  getCamera,
  createCamera as createCameraApi,
  updateCamera as updateCameraApi,
  deleteCamera as deleteCameraApi,
} from "../api/cameras.api";
import type {
  Camera,
  CreateCameraRequest,
  UpdateCameraRequest,
} from "../types/camera.types";

export interface UseCamerasReturn {
  cameras: Camera[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export interface UseCameraReturn {
  camera: Camera | undefined;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export interface UseCameraMutationsReturn {
  createCamera: UseMutationResult<Camera, Error, CreateCameraRequest>;
  updateCamera: UseMutationResult<Camera, Error, UpdateCameraRequest & { id: string }>;
  deleteCamera: UseMutationResult<void, Error, string>;
}

export function useCameras(): UseCamerasReturn {
  const query = useQuery({
    queryKey: ["cameras"],
    queryFn: getCameras,
    staleTime: 30 * 1000, // 30 seconds
  });

  return {
    cameras: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error ? query.error.message : null,
    refetch: query.refetch,
  };
}

export function useCamera(id: string): UseCameraReturn {
  const query = useQuery({
    queryKey: ["cameras", id],
    queryFn: () => getCamera(id),
    staleTime: 30 * 1000, // 30 seconds
    enabled: !!id,
  });

  return {
    camera: query.data,
    isLoading: query.isLoading,
    error: query.error ? query.error.message : null,
    refetch: query.refetch,
  };
}

export function useCameraMutations(): UseCameraMutationsReturn {
  const queryClient = useQueryClient();

  const createCamera = useMutation<Camera, Error, CreateCameraRequest>({
    mutationFn: (data) => createCameraApi(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cameras"] });
    },
  });

  const updateCamera = useMutation<Camera, Error, UpdateCameraRequest & { id: string }>({
    mutationFn: ({ id, ...data }) => updateCameraApi(id, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["cameras"] });
      queryClient.invalidateQueries({ queryKey: ["cameras", variables.id] });
    },
  });

  const deleteCamera = useMutation<void, Error, string>({
    mutationFn: (id) => deleteCameraApi(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cameras"] });
    },
  });

  return {
    createCamera,
    updateCamera,
    deleteCamera,
  };
}
