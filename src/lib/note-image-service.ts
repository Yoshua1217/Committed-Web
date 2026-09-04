import { storage } from "@/lib/firebase";
import {
  deleteObject,
  getDownloadURL,
  listAll,
  ref,
  uploadBytesResumable,
} from "firebase/storage";

const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_EDGE = 2048;
const WEBP_QUALITY = 0.9;
const SUPPORTED_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export interface UploadedNoteImage {
  downloadUrl: string;
  storagePath: string;
  altText: string;
}

function safeAltText(filename: string) {
  return filename
    .replace(/\.[^.]+$/, "")
    .replace(/[\[\]()]/g, " ")
    .replace(/\s+/g, " ")
    .trim() || "Pasted image";
}

function randomId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("The image could not be compressed.")),
      "image/webp",
      WEBP_QUALITY,
    );
  });
}

async function prepareImage(file: File): Promise<{ blob: Blob; extension: string }> {
  if (!SUPPORTED_TYPES.has(file.type)) throw new Error("Use a PNG, JPEG, WebP, or GIF image.");
  if (file.size > MAX_SOURCE_BYTES) throw new Error("Images must be smaller than 20 MB before processing.");

  if (file.type === "image/gif") {
    if (file.size > MAX_UPLOAD_BYTES) throw new Error("Animated GIFs must be 5 MB or smaller.");
    return { blob: file, extension: "gif" };
  }

  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("The image could not be processed on this device.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await canvasBlob(canvas);
    if (blob.size > MAX_UPLOAD_BYTES) throw new Error("The processed image is still larger than 5 MB.");
    return { blob, extension: "webp" };
  } finally {
    bitmap.close();
  }
}

export async function uploadNoteImage(
  userId: string,
  noteId: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<UploadedNoteImage> {
  const prepared = await prepareImage(file);
  const storagePath = `note-images/${userId}/${noteId}/${randomId()}.${prepared.extension}`;
  const imageRef = ref(storage, storagePath);
  const upload = uploadBytesResumable(imageRef, prepared.blob, {
    contentType: prepared.blob.type,
    customMetadata: { originalName: file.name || "pasted-image" },
  });

  await new Promise<void>((resolve, reject) => {
    upload.on(
      "state_changed",
      (snapshot) => onProgress?.(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)),
      reject,
      resolve,
    );
  });

  return {
    downloadUrl: await getDownloadURL(upload.snapshot.ref),
    storagePath,
    altText: safeAltText(file.name),
  };
}

export async function deleteNoteImages(userId: string, noteId: string): Promise<void> {
  const noteFolder = ref(storage, `note-images/${userId}/${noteId}`);
  const contents = await listAll(noteFolder);
  await Promise.all([
    ...contents.items.map(deleteObject),
    ...contents.prefixes.map(async (prefix) => {
      const nested = await listAll(prefix);
      await Promise.all(nested.items.map(deleteObject));
    }),
  ]);
}
