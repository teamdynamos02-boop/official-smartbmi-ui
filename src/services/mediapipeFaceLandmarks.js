import { DrawingUtils, FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

const MEDIAPIPE_WASM_ROOT = "/mediapipe/wasm";
const FACE_LANDMARKER_MODEL_URL = "/mediapipe/models/face_landmarker.task";

let faceLandmarkerPromise = null;

export async function getFaceLandmarkerRuntime() {
  if (!faceLandmarkerPromise) {
    faceLandmarkerPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_ROOT);
      const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: FACE_LANDMARKER_MODEL_URL,
        },
        runningMode: "VIDEO",
        numFaces: 1,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: false,
        minFaceDetectionConfidence: 0.35,
        minFacePresenceConfidence: 0.35,
        minTrackingConfidence: 0.35,
      });

      return { DrawingUtils, FaceLandmarker, faceLandmarker };
    })().catch((error) => {
      faceLandmarkerPromise = null;
      throw error;
    });
  }

  return faceLandmarkerPromise;
}
