// Minimal stub for @mediapipe/tasks-vision used in test environments.
// The real package is lazy-loaded at runtime; this file prevents Vite from
// failing to resolve the import during test transforms.
export const FilesetResolver = {
  forVisionTasks: () => Promise.resolve({}),
}
export const FaceDetector = {
  createFromOptions: () => Promise.resolve({
    detectForVideo: () => ({ detections: [] }),
    close: () => {},
  }),
}
