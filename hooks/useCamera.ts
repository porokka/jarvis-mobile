import { useRef, useCallback, useState } from "react";
import { CameraView, useCameraPermissions } from "expo-camera";

export function useCamera() {
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [isReady, setIsReady] = useState(false);

  const captureFrame = useCallback(async (): Promise<string | null> => {
    if (!cameraRef.current || !isReady) return null;
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.5,
        exif: false,
      });
      return photo?.uri ?? null;
    } catch (e) {
      console.warn("[CAM] capture failed", e);
      return null;
    }
  }, [isReady]);

  return { cameraRef, permission, requestPermission, isReady, setIsReady, captureFrame };
}
