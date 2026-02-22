"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  ArrowLeftIcon,
  ArrowUpTrayIcon,
  ArrowDownTrayIcon,
  ArrowPathIcon,
  ArrowUpIcon,
  ArrowLongUpIcon,
  ArrowLongDownIcon,
  ArrowsPointingOutIcon,
  PlayIcon,
  PauseIcon,
  PlusIcon,
  MagnifyingGlassPlusIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
  SparklesIcon,
  ViewfinderCircleIcon,
  CameraIcon,
  UserIcon,
  EyeIcon,
  HandRaisedIcon,
  ArrowsRightLeftIcon,
  FilmIcon,
  ArrowUturnLeftIcon,
  ArrowRightIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";
import { PlayIcon as PlayIconSolid } from "@heroicons/react/24/solid";
import {
  getProviderSettings,
} from "@/store/utils/localStorage";
import { useStitchVideos, type StitchProgress } from "@/hooks/useStitchVideos";
import {
  EvasionTechnique,
  TECHNIQUE_LABELS,
  applyEvasion,
} from "@/utils/promptEvasion";

// ============================================================================
// Types
// ============================================================================

interface Clip {
  id: string;
  thumbnail: string | null;         // runtime: display URL for timeline
  thumbnailPath: string | null;      // persisted: relative path on disk
  videoSrc: string | null;           // runtime: blob URL or API URL for playback
  videoPath: string | null;          // persisted: relative path on disk
  lastFrame: string | null;          // runtime: last frame data URL for timeline display
  lastFramePath: string | null;      // persisted: relative path on disk
  duration: number;
  prompt: string;                    // evasion-applied prompt sent to API
  rawPrompt: string;                 // original prompt before evasion
  evasionTechnique: EvasionTechnique; // technique used for this clip
  angleVariants: AngleVariant[];
  status: "idle" | "generating" | "done" | "error";
  error?: string;
}

// EvasionTechnique type imported from @/utils/promptEvasion
const TECHNIQUES = Object.entries(TECHNIQUE_LABELS) as [EvasionTechnique, string][];

interface CinematicOption {
  id: string;
  label: string;
  prompt: string;
}

interface CinematicGroup {
  id: string;
  label: string;
  multiSelect: boolean;
  options: CinematicOption[];
}

interface CinematicState {
  camera: string | null;
  lighting: string | null;
  lens: string | null;
  mood: string | null;
  color: string | null;
  body: string | null;
  scene: Set<string>;
}

const CINEMATIC_GROUPS: CinematicGroup[] = [
  {
    id: "camera",
    label: "Camera",
    multiSelect: false,
    options: [
      { id: "static", label: "Static", prompt: "static camera, no camera movement, locked shot" },
      { id: "push-in", label: "Slow push in", prompt: "slow push in toward subject, dolly in, gradual" },
      { id: "pull-back", label: "Pull back", prompt: "slow pull back from subject, dolly out, revealing surroundings" },
      { id: "slow-pan", label: "Slow pan", prompt: "slow smooth pan, gentle horizontal camera movement" },
      { id: "tracking", label: "Tracking", prompt: "tracking shot following the subject, camera moves alongside, steadicam" },
      { id: "orbit", label: "Orbit", prompt: "slow orbit shot circling around the subject, arc movement" },
      { id: "crane", label: "Crane", prompt: "crane shot, sweeping vertical camera movement, boom" },
      { id: "handheld", label: "Handheld", prompt: "handheld camera, slight natural camera shake, raw documentary feel" },
      { id: "steadicam", label: "Steadicam", prompt: "steadicam shot, smooth gliding movement, elegant tracking" },
    ],
  },
  {
    id: "lighting",
    label: "Lighting",
    multiSelect: false,
    options: [
      { id: "golden-hour", label: "Golden hour", prompt: "golden hour warm sunset lighting, magic hour, rim light" },
      { id: "rim-light", label: "Rim light", prompt: "rim lighting, edge light, glowing backlit outline, subject separation" },
      { id: "soft-diffused", label: "Soft diffused", prompt: "soft diffused light, gentle even lighting, flattering" },
      { id: "low-key", label: "Low key", prompt: "low key dramatic lighting, deep shadows, high contrast, moody" },
      { id: "high-key", label: "High key", prompt: "high key bright even lighting, minimal shadows, clean" },
      { id: "neon", label: "Neon", prompt: "neon lighting, neon glow, colorful urban night light" },
      { id: "volumetric", label: "Volumetric", prompt: "volumetric lighting, god rays, light rays through atmosphere" },
      { id: "natural", label: "Natural", prompt: "natural available light, realistic motivated lighting" },
      { id: "candlelight", label: "Candlelight", prompt: "candlelight, warm flickering intimate light" },
    ],
  },
  {
    id: "lens",
    label: "Lens",
    multiSelect: false,
    options: [
      { id: "shallow-dof", label: "Shallow DoF", prompt: "shallow depth of field, beautiful bokeh, blurred background, subject isolation" },
      { id: "deep-focus", label: "Deep focus", prompt: "deep focus, everything in focus, sharp throughout" },
      { id: "85mm", label: "85mm portrait", prompt: "shot on 85mm lens, portrait telephoto compression, flattering" },
      { id: "35mm", label: "35mm wide", prompt: "shot on 35mm wide angle lens, natural cinematic perspective" },
      { id: "anamorphic", label: "Anamorphic", prompt: "anamorphic widescreen, oval bokeh, cinematic lens flare" },
      { id: "tilt-shift", label: "Tilt-shift", prompt: "tilt-shift miniature effect, selective focus plane" },
    ],
  },
  {
    id: "mood",
    label: "Mood",
    multiSelect: false,
    options: [
      { id: "misty", label: "Misty", prompt: "misty atmospheric haze, soft diffused environment" },
      { id: "foggy", label: "Foggy", prompt: "dense fog, low visibility, mysterious atmosphere" },
      { id: "rainy", label: "Rainy", prompt: "rain, wet surfaces, rain reflections, moody weather" },
      { id: "moody", label: "Moody", prompt: "moody dark atmosphere, brooding, somber tone" },
      { id: "ethereal", label: "Ethereal", prompt: "ethereal dreamlike atmosphere, soft glowing, otherworldly" },
      { id: "gritty", label: "Gritty", prompt: "gritty raw atmosphere, urban texture, harsh reality" },
      { id: "dreamy", label: "Dreamy", prompt: "dreamy soft focus atmosphere, romantic haze, gentle" },
      { id: "serene", label: "Serene", prompt: "serene peaceful calm atmosphere, tranquil, still" },
    ],
  },
  {
    id: "color",
    label: "Color",
    multiSelect: false,
    options: [
      { id: "warm-tones", label: "Warm tones", prompt: "warm color palette, amber tones, golden warm tones" },
      { id: "cool-tones", label: "Cool tones", prompt: "cool blue tones, cold color grading, teal shadows" },
      { id: "desaturated", label: "Desaturated", prompt: "muted colors, desaturated, faded tones, subdued palette" },
      { id: "vibrant", label: "Vibrant", prompt: "vivid colors, saturated, rich color palette, punchy colors" },
      { id: "teal-orange", label: "Teal & Orange", prompt: "teal and orange color grading, blockbuster color palette" },
      { id: "pastel", label: "Pastel", prompt: "pastel colors, soft muted pastels, light airy tones" },
      { id: "monochrome", label: "Monochrome", prompt: "black and white, monochromatic, grayscale" },
      { id: "film-noir", label: "Film noir", prompt: "film noir style, high contrast black and white, moody shadows" },
    ],
  },
  {
    id: "body",
    label: "Body",
    multiSelect: false,
    options: [
      { id: "frozen", label: "Frozen pose", prompt: "the person is FROZEN like a statue, completely rigid, ZERO movement, no pose change, no weight shift, no head turn, no arm movement, body is a single solid unit, like a mannequin" },
      { id: "natural", label: "Natural pose", prompt: "the person maintains their general pose with subtle natural adjustments allowed, slight weight shift or head tilt is acceptable, but no major pose changes, no walking, no sitting down, no large movements" },
      { id: "action", label: "Action allowed", prompt: "the person may change pose and perform actions freely, movement is allowed" },
    ],
  },
  {
    id: "scene",
    label: "Scene",
    multiSelect: true,
    options: [
      { id: "smooth-motion", label: "Smooth motion", prompt: "smooth continuous motion, no sudden movements" },
      { id: "no-cuts", label: "No cuts", prompt: "no scene cuts, no transitions" },
      { id: "consistent-light", label: "Consistent light", prompt: "maintain exact same brightness, exposure, color temperature, and lighting throughout, no darkening or brightening" },
      { id: "eye-contact", label: "Eye contact", prompt: "person looking directly at camera, direct eye contact with viewer, facing the camera" },
      { id: "empty-scene", label: "Empty scene", prompt: "no other people, no bystanders, no pedestrians, no other vehicles, no moving objects in background, empty surroundings, subject is alone in the scene" },
    ],
  },
];

const ANGLE_LOCK = "Output exactly ONE single continuous image, NOT a collage, NOT a grid, NOT split, NOT multiple views. DO NOT change the location, DO NOT change the background, DO NOT change the setting. Keep the EXACT same room, vehicle, street, interior, or exterior. Same person, same face, same skin tone, same skin color, same ethnicity, same body type, same hair color, same hairstyle, same makeup, same clothing, same accessories, same colors, same lighting, same brightness, same exposure, same color temperature. DO NOT alter the person's appearance in any way. Photorealistic, sharp details";

// Lighter lock for custom prompts — preserves identity & location but allows pose/action changes
const CUSTOM_LOCK = "Output exactly ONE single continuous image, NOT a collage, NOT a grid, NOT split, NOT multiple views. DO NOT change the location, DO NOT change the background, DO NOT change the setting. Keep the EXACT same room, vehicle, street, interior, or exterior. Same person, same face, same skin tone, same skin color, same ethnicity, same body type, same hair color, same hairstyle, same makeup, same clothing, same accessories, same colors, same lighting, same brightness, same exposure, same color temperature. Photorealistic, sharp details";

const ANGLE_PRESETS = [
  // --- Enhance ---
  {
    id: "upscale",
    label: "Upscale",
    group: "Enhance",
    prompt: `Upscale this image. Keep absolutely everything identical — same composition, same framing, same person, same pose, same background. Only enhance resolution and sharpness. ${ANGLE_LOCK}`,
  },
  {
    id: "clean",
    label: "Clean up",
    group: "Enhance",
    prompt: `Recreate this exact image with higher quality. Same camera angle, same framing, same composition. Remove artifacts, noise, and compression only. ${ANGLE_LOCK}`,
  },
  // --- Framing ---
  {
    id: "closeup",
    label: "Close-up",
    group: "Framing",
    prompt: `Close-up shot focusing on the face and upper body. Camera moves closer to the subject but stays in the EXACT same location. ${ANGLE_LOCK}`,
  },
  {
    id: "wide",
    label: "Wide shot",
    group: "Framing",
    prompt: `Pull the camera back to show more of the SAME space. Wider framing of the EXACT same location visible in the input. DO NOT invent new surroundings — only reveal more of what is already there. ${ANGLE_LOCK}`,
  },
  {
    id: "medium",
    label: "Medium shot",
    group: "Framing",
    prompt: `Medium shot framing the subject from the waist up. Classic conversational framing. Camera stays in the EXACT same location. ${ANGLE_LOCK}`,
  },
  {
    id: "extreme-closeup",
    label: "Extreme CU",
    group: "Framing",
    prompt: `Single extreme close-up of the subject's eyes and nose area. One continuous image, NOT a collage, NOT split, NOT multiple views. Crop tightly into the face from the input image. EXACT same location. ${ANGLE_LOCK}`,
  },
  // --- Angle ---
  {
    id: "low",
    label: "Low angle",
    group: "Angle",
    prompt: `Low angle shot looking upward at the subject from below. Camera tilts up but stays in the EXACT same location. ${ANGLE_LOCK}`,
  },
  {
    id: "high",
    label: "High angle",
    group: "Angle",
    prompt: `High angle shot looking down at the subject from above. Camera tilts down but stays in the EXACT same location. ${ANGLE_LOCK}`,
  },
  {
    id: "profile",
    label: "Profile",
    group: "Angle",
    prompt: `Side profile view of the subject, 90-degree side angle. Camera rotates around the subject but stays in the EXACT same location. ${ANGLE_LOCK}`,
  },
  {
    id: "over-shoulder",
    label: "Over shoulder",
    group: "Angle",
    prompt: `Over-the-shoulder perspective of the subject. Camera moves behind the subject but stays in the EXACT same location. Slight depth of field. ${ANGLE_LOCK}`,
  },
  {
    id: "dutch",
    label: "Dutch angle",
    group: "Angle",
    prompt: `Rotate the entire image 15 degrees clockwise. Do NOT regenerate or reimagine anything. Just tilt/rotate the existing image. ${ANGLE_LOCK}`,
  },
  {
    id: "pov",
    label: "POV",
    group: "Angle",
    prompt: `First-person point-of-view shot showing what the subject is looking at. Camera positioned at the subject's eye level facing the direction they face. EXACT same location. ${ANGLE_LOCK}`,
  },
  {
    id: "behind",
    label: "Behind",
    group: "Angle",
    prompt: `Camera positioned directly behind the subject, looking forward over their head or shoulder into the scene. EXACT same location. ${ANGLE_LOCK}`,
  },
  {
    id: "mirror",
    label: "Mirror flip",
    group: "Angle",
    prompt: `Horizontally mirror/flip this exact image. Single image, NOT a collage, NOT side-by-side. Everything is reversed left-to-right but otherwise completely identical. ${ANGLE_LOCK}`,
  },
  // --- Orbit Camera (camera moves, person stays FROZEN) ---
  {
    id: "cam-orbit-left-45",
    label: "Cam orbit left 45°",
    group: "Orbit Camera",
    prompt: `Move the virtual camera 45 degrees to the LEFT, orbiting around the subject. The person is FROZEN like a statue — DO NOT move their arms, legs, hands, feet, head, or any body part. ZERO pose change. The person's body position is IDENTICAL to the original. Only the viewing angle changes. The background shifts naturally because we are seeing the scene from a different camera position. EXACT same location. ${ANGLE_LOCK}`,
  },
  {
    id: "cam-orbit-right-45",
    label: "Cam orbit right 45°",
    group: "Orbit Camera",
    prompt: `Move the virtual camera 45 degrees to the RIGHT, orbiting around the subject. The person is FROZEN like a statue — DO NOT move their arms, legs, hands, feet, head, or any body part. ZERO pose change. The person's body position is IDENTICAL to the original. Only the viewing angle changes. The background shifts naturally because we are seeing the scene from a different camera position. EXACT same location. ${ANGLE_LOCK}`,
  },
  {
    id: "cam-orbit-left-90",
    label: "Cam orbit left 90°",
    group: "Orbit Camera",
    prompt: `Move the virtual camera 90 degrees to the LEFT, orbiting around the subject. The person is FROZEN like a statue — DO NOT move their arms, legs, hands, feet, head, or any body part. ZERO pose change. The person's body position is IDENTICAL to the original. Only the viewing angle changes. We now see the scene from a completely different camera angle. EXACT same location. ${ANGLE_LOCK}`,
  },
  {
    id: "cam-orbit-right-90",
    label: "Cam orbit right 90°",
    group: "Orbit Camera",
    prompt: `Move the virtual camera 90 degrees to the RIGHT, orbiting around the subject. The person is FROZEN like a statue — DO NOT move their arms, legs, hands, feet, head, or any body part. ZERO pose change. The person's body position is IDENTICAL to the original. Only the viewing angle changes. We now see the scene from a completely different camera angle. EXACT same location. ${ANGLE_LOCK}`,
  },
  // --- Orbit Person (person rotates, camera stays) ---
  {
    id: "person-orbit-left-45",
    label: "Person turn left 45°",
    group: "Orbit Person",
    prompt: `The subject rotates their ENTIRE body 45 degrees to THEIR LEFT as a single rigid unit, like a mannequin on a turntable. DO NOT change the position of arms, legs, hands, or feet relative to the body. All accessories (necklaces, watches, bracelets, bags, hats, glasses, earrings, belts) rotate WITH the body — they must appear from the correct angle for the new viewing direction, NOT remain front-facing. Same standing/sitting pose, just rotated. The camera does NOT move. EXACT same location, same background. ${ANGLE_LOCK}`,
  },
  {
    id: "person-orbit-right-45",
    label: "Person turn right 45°",
    group: "Orbit Person",
    prompt: `The subject rotates their ENTIRE body 45 degrees to THEIR RIGHT as a single rigid unit, like a mannequin on a turntable. DO NOT change the position of arms, legs, hands, or feet relative to the body. All accessories (necklaces, watches, bracelets, bags, hats, glasses, earrings, belts) rotate WITH the body — they must appear from the correct angle for the new viewing direction, NOT remain front-facing. Same standing/sitting pose, just rotated. The camera does NOT move. EXACT same location, same background. ${ANGLE_LOCK}`,
  },
  {
    id: "person-orbit-left-90",
    label: "Person turn left 90°",
    group: "Orbit Person",
    prompt: `The subject rotates their ENTIRE body 90 degrees to THEIR LEFT as a single rigid unit, like a mannequin on a turntable, showing their right side profile. DO NOT change the position of arms, legs, hands, or feet relative to the body. All accessories (necklaces, watches, bracelets, bags, hats, glasses, earrings, belts) rotate WITH the body — they must appear from the correct angle for the new viewing direction, NOT remain front-facing. Same standing/sitting pose, just rotated. The camera does NOT move. EXACT same location, same background. ${ANGLE_LOCK}`,
  },
  {
    id: "person-orbit-right-90",
    label: "Person turn right 90°",
    group: "Orbit Person",
    prompt: `The subject rotates their ENTIRE body 90 degrees to THEIR RIGHT as a single rigid unit, like a mannequin on a turntable, showing their left side profile. DO NOT change the position of arms, legs, hands, or feet relative to the body. All accessories (necklaces, watches, bracelets, bags, hats, glasses, earrings, belts) rotate WITH the body — they must appear from the correct angle for the new viewing direction, NOT remain front-facing. Same standing/sitting pose, just rotated. The camera does NOT move. EXACT same location, same background. ${ANGLE_LOCK}`,
  },
  {
    id: "person-orbit-left-135",
    label: "Person turn left 135°",
    group: "Orbit Person",
    prompt: `The subject rotates their ENTIRE body 135 degrees to THEIR LEFT as a single rigid unit, like a mannequin on a turntable, showing mostly their back with a slight right-side view. DO NOT change the position of arms, legs, hands, or feet relative to the body. All accessories (necklaces, watches, bracelets, bags, hats, glasses, earrings, belts) rotate WITH the body — they must appear from the correct angle for the new viewing direction, NOT remain front-facing. Same standing/sitting pose, just rotated. The camera does NOT move. EXACT same location, same background. ${ANGLE_LOCK}`,
  },
  {
    id: "person-orbit-right-135",
    label: "Person turn right 135°",
    group: "Orbit Person",
    prompt: `The subject rotates their ENTIRE body 135 degrees to THEIR RIGHT as a single rigid unit, like a mannequin on a turntable, showing mostly their back with a slight left-side view. DO NOT change the position of arms, legs, hands, or feet relative to the body. All accessories (necklaces, watches, bracelets, bags, hats, glasses, earrings, belts) rotate WITH the body — they must appear from the correct angle for the new viewing direction, NOT remain front-facing. Same standing/sitting pose, just rotated. The camera does NOT move. EXACT same location, same background. ${ANGLE_LOCK}`,
  },
  {
    id: "person-orbit-180",
    label: "Person turn 180°",
    group: "Orbit Person",
    prompt: `The subject rotates their ENTIRE body 180 degrees, turning completely around to face away from the camera, showing their back. Like a mannequin on a turntable rotated halfway. DO NOT change the position of arms, legs, hands, or feet relative to the body. All accessories (necklaces, watches, bracelets, bags, hats, glasses, earrings, belts) rotate WITH the body — they must appear from the correct angle for the new viewing direction, NOT remain front-facing. Same standing/sitting pose, just rotated. The camera does NOT move. EXACT same location, same background. ${ANGLE_LOCK}`,
  },
] as const;

const ANGLE_ICONS: Record<string, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
  upscale: ArrowUpIcon,
  clean: SparklesIcon,
  closeup: ViewfinderCircleIcon,
  wide: ArrowsPointingOutIcon,
  low: ArrowLongUpIcon,
  high: ArrowLongDownIcon,
  profile: UserIcon,
  "over-shoulder": EyeIcon,
  medium: FilmIcon,
  dutch: ArrowsRightLeftIcon,
  pov: HandRaisedIcon,
  behind: ArrowUturnLeftIcon,
  "extreme-closeup": ViewfinderCircleIcon,
  mirror: ArrowsRightLeftIcon,
  "cam-orbit-left-45": ArrowLeftIcon,
  "cam-orbit-right-45": ArrowRightIcon,
  "cam-orbit-left-90": ArrowLeftIcon,
  "cam-orbit-right-90": ArrowRightIcon,
  "person-orbit-left-45": ArrowLeftIcon,
  "person-orbit-right-45": ArrowRightIcon,
  "person-orbit-left-90": ArrowLeftIcon,
  "person-orbit-right-90": ArrowRightIcon,
  "person-orbit-left-135": ArrowLeftIcon,
  "person-orbit-right-135": ArrowRightIcon,
  "person-orbit-180": ArrowUturnLeftIcon,
};

interface AngleVariant {
  id: string;
  clipId: string;
  presetId: string;
  image: string | null;
  imagePath: string | null;
  status: "generating" | "done" | "error";
  error?: string;
}

const BASE_CONTINUITY = "seamlessly continue this scene from the input frame, maintain consistent style, atmosphere, brightness, and exposure";

// ============================================================================
// Persistence — saves to user-chosen project directory via /api/scenario
// ============================================================================

const PROJECTS_KEY = "node-banana-scenario-projects";

interface ScenarioProject {
  id: string;
  name: string;
  directoryPath: string;
  createdAt: string;
}

// Persisted state — uses file paths instead of base64
interface ScenarioStateDisk {
  inputImagePath: string | null;
  originalInputImagePath?: string | null;
  inputAngleVariants?: Array<{
    id: string;
    presetId: string;
    imagePath: string | null;
    status: "done" | "error";
  }>;
  prompt: string;
  evasionTechnique: EvasionTechnique;
  continuityEnabled: boolean;
  activeModifiers?: string[];
  cinematic?: {
    camera?: string | null;
    lighting?: string | null;
    lens?: string | null;
    mood?: string | null;
    color?: string | null;
    body?: string | null;
    scene?: string[];
  };
  duration: number;
  aspectRatio: string;
  resolution: string;
  useLastFrame: boolean;
  clips: Array<{
    id: string;
    thumbnailPath: string | null;
    videoPath: string | null;
    lastFramePath: string | null;
    duration: number;
    prompt: string;
    rawPrompt?: string;
    evasionTechnique?: EvasionTechnique;
    angleVariants?: Array<{
      id: string;
      presetId: string;
      imagePath: string | null;
      status: "done" | "error";
    }>;
    status: "idle" | "generating" | "done" | "error";
  }>;
  activeClipId: string | null;
}

// Helper: composite two images side by side (main left, reference right) for identity context
async function compositeWithReference(mainSrc: string, refSrc: string): Promise<string> {
  const loadImg = (src: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });

  const [mainImg, refImg] = await Promise.all([loadImg(mainSrc), loadImg(refSrc)]);

  // Reference image takes 30% of width, main takes 70%
  const refScale = 0.3;
  const mainScale = 1 - refScale;
  const height = Math.max(mainImg.height, refImg.height);
  const mainW = Math.round(height * (mainImg.width / mainImg.height) / mainScale);
  const totalW = Math.round(mainW);
  const mainDrawW = Math.round(totalW * mainScale);
  const refDrawW = totalW - mainDrawW;

  const canvas = document.createElement("canvas");
  canvas.width = totalW;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  // Black background
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, totalW, height);

  // Draw main image on left
  ctx.drawImage(mainImg, 0, 0, mainDrawW, height);

  // Draw white separator line
  ctx.fillStyle = "#fff";
  ctx.fillRect(mainDrawW - 1, 0, 2, height);

  // Draw reference image on right, centered vertically
  const refAspect = refImg.width / refImg.height;
  const refDrawH = Math.min(height, refDrawW / refAspect);
  const refY = (height - refDrawH) / 2;
  ctx.drawImage(refImg, mainDrawW, refY, refDrawW, refDrawH);

  return canvas.toDataURL("image/png");
}

// Helper: resolve image source to a data URL for API calls
async function resolveToDataUrl(src: string): Promise<string> {
  if (src.startsWith("data:")) return src;
  if (src.startsWith("/api/") || src.startsWith("http")) {
    const res = await fetch(src);
    const blob = await res.blob();
    return new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  }
  return src;
}

// Helper: build API URL from absolute file path
function imageUrl(absolutePath: string): string {
  return `/api/scenario/image?path=${encodeURIComponent(absolutePath)}`;
}

// Helper: resolve relative path to absolute + API URL
function resolveImagePath(relativePath: string | null, projectDir: string): string | null {
  if (!relativePath) return null;
  if (relativePath.startsWith("/") || relativePath.startsWith("data:") || relativePath.startsWith("blob:")) return relativePath;
  const absPath = `${projectDir}/${relativePath}`;
  return imageUrl(absPath);
}

function loadProjects(): ScenarioProject[] {
  try {
    const raw = localStorage.getItem(PROJECTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveProjects(projects: ScenarioProject[]) {
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
}

interface LoadedScenarioState {
  inputImage: string | null;
  inputImagePath: string | null;
  originalInputImage: string | null;
  originalInputImagePath: string | null;
  inputAngleVariants: AngleVariant[];
  prompt: string;
  evasionTechnique: EvasionTechnique;
  cinematicEnabled: boolean;
  cinematicState: CinematicState;
  duration: number;
  aspectRatio: string;
  resolution: string;
  clips: Clip[];
  activeClipId: string | null;
}

async function loadScenarioStateFromDisk(directoryPath: string): Promise<LoadedScenarioState | null> {
  try {
    const res = await fetch(`/api/scenario?path=${encodeURIComponent(directoryPath)}`);
    const data = await res.json();
    if (!data.success || !data.state) return null;

    const disk = data.state as ScenarioStateDisk & { inputImage?: string };

    let inputImage: string | null = null;
    let inputImagePath: string | null = disk.inputImagePath ?? null;

    if (inputImagePath) {
      inputImage = resolveImagePath(inputImagePath, directoryPath);
    } else if (disk.inputImage && !disk.inputImage.startsWith("data:")) {
      inputImagePath = disk.inputImage;
      inputImage = resolveImagePath(disk.inputImage, directoryPath);
    } else if (disk.inputImage) {
      inputImage = disk.inputImage;
    }

    // Resolve original input image (the first upload, not a variant)
    const originalInputImagePath = disk.originalInputImagePath ?? null;
    const originalInputImage = originalInputImagePath
      ? resolveImagePath(originalInputImagePath, directoryPath)
      : inputImage; // fallback: treat current input as original if no separate original saved

    const clips: Clip[] = (disk.clips ?? []).map((c) => ({
      id: c.id,
      thumbnail: resolveImagePath(c.thumbnailPath, directoryPath),
      thumbnailPath: c.thumbnailPath ?? null,
      videoSrc: resolveImagePath(c.videoPath, directoryPath),
      videoPath: c.videoPath ?? null,
      lastFrame: resolveImagePath(c.lastFramePath ?? null, directoryPath),
      lastFramePath: c.lastFramePath ?? null,
      duration: c.duration,
      prompt: c.prompt,
      rawPrompt: c.rawPrompt ?? c.prompt,
      evasionTechnique: c.evasionTechnique ?? "zwsp",
      angleVariants: (c.angleVariants ?? []).map((av) => ({
        id: av.id,
        clipId: c.id,
        presetId: av.presetId,
        image: resolveImagePath(av.imagePath, directoryPath),
        imagePath: av.imagePath,
        status: av.status,
      })),
      status: c.status === "generating" ? "done" : c.status, // reset stuck generating state
    }));

    const inputAngleVariants: AngleVariant[] = (disk.inputAngleVariants ?? []).map((av) => ({
      id: av.id,
      clipId: "__input__",
      presetId: av.presetId,
      image: resolveImagePath(av.imagePath, directoryPath),
      imagePath: av.imagePath,
      status: av.status,
    }));

    const cinematicState: CinematicState = disk.cinematic
      ? {
          camera: disk.cinematic.camera ?? null,
          lighting: disk.cinematic.lighting ?? null,
          lens: disk.cinematic.lens ?? null,
          mood: disk.cinematic.mood ?? null,
          color: disk.cinematic.color ?? null,
          body: disk.cinematic.body ?? "frozen",
          scene: new Set(disk.cinematic.scene ?? []),
        }
      : {
          // Backwards compat from old activeModifiers
          camera: (disk.activeModifiers ?? []).includes("static-camera") ? "static" : null,
          lighting: null,
          lens: null,
          mood: null,
          color: null,
          body: "frozen",
          scene: new Set(
            (disk.activeModifiers ?? []).filter((m) =>
              ["smooth-motion", "no-cuts", "consistent-lighting", "eye-contact", "empty-scene"].includes(m)
            ).map((m) => m === "consistent-lighting" ? "consistent-light" : m)
          ),
        };

    return {
      inputImage,
      inputImagePath,
      originalInputImage,
      originalInputImagePath,
      inputAngleVariants,
      prompt: disk.prompt ?? "",
      evasionTechnique: disk.evasionTechnique ?? "zwsp",
      cinematicEnabled: disk.continuityEnabled ?? true,
      cinematicState,
      duration: disk.duration ?? 12,
      aspectRatio: disk.aspectRatio ?? "9:16",
      resolution: disk.resolution ?? "480p",
      clips,
      activeClipId: disk.activeClipId ?? null,
    };
  } catch {
    return null;
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function saveScenarioStateToDisk(
  directoryPath: string,
  state: {
    inputImagePath: string | null;
    originalInputImagePath: string | null;
    inputAngleVariants: AngleVariant[];
    prompt: string;
    evasionTechnique: EvasionTechnique;
    cinematicEnabled: boolean;
    cinematicState: CinematicState;
    duration: number;
    aspectRatio: string;
    resolution: string;
    useLastFrame: boolean;
    clips: Clip[];
    activeClipId: string | null;
  }
) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const diskState: ScenarioStateDisk = {
      inputImagePath: state.inputImagePath,
      originalInputImagePath: state.originalInputImagePath,
      inputAngleVariants: state.inputAngleVariants
        .filter((av): av is AngleVariant & { status: "done" | "error" } => av.status !== "generating")
        .map((av) => ({
          id: av.id,
          presetId: av.presetId,
          imagePath: av.imagePath,
          status: av.status,
        })),
      prompt: state.prompt,
      evasionTechnique: state.evasionTechnique,
      continuityEnabled: state.cinematicEnabled,
      cinematic: {
        camera: state.cinematicState.camera,
        lighting: state.cinematicState.lighting,
        lens: state.cinematicState.lens,
        mood: state.cinematicState.mood,
        color: state.cinematicState.color,
        body: state.cinematicState.body,
        scene: Array.from(state.cinematicState.scene),
      },
      duration: state.duration,
      aspectRatio: state.aspectRatio,
      resolution: state.resolution,
      useLastFrame: state.useLastFrame,
      clips: state.clips
        .filter((c) => c.status !== "generating") // don't persist in-progress clips
        .map((c) => ({
          id: c.id,
          thumbnailPath: c.thumbnailPath,
          videoPath: c.videoPath,
          lastFramePath: c.lastFramePath,
          duration: c.duration,
          prompt: c.prompt,
          rawPrompt: c.rawPrompt,
          evasionTechnique: c.evasionTechnique,
          angleVariants: c.angleVariants
            .filter((av): av is AngleVariant & { status: "done" | "error" } => av.status !== "generating")
            .map((av) => ({
              id: av.id,
              presetId: av.presetId,
              imagePath: av.imagePath,
              status: av.status,
            })),
          status: c.status,
        })),
      activeClipId: state.activeClipId,
    };
    fetch("/api/scenario", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ directoryPath, state: diskState }),
    }).catch(() => {});
  }, 1000);
}

// ============================================================================
// Last frame extraction utility
// ============================================================================

// Grab a canvas frame from a video element, with a delay to ensure decode
function grabFrame(videoEl: HTMLVideoElement): Promise<string> {
  return new Promise((resolve, reject) => {
    // Wait 200ms after seek for frame to decode
    setTimeout(() => {
      try {
        const w = videoEl.videoWidth || 640;
        const h = videoEl.videoHeight || 360;
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("No canvas context")); return; }
        ctx.drawImage(videoEl, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/png");
        if (dataUrl.length < 500) { reject(new Error("Blank frame")); return; }
        resolve(dataUrl);
      } catch (err) { reject(err); }
    }, 200);
  });
}

// Extract last frame from a video source URL
function extractLastFrame(videoSrc: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    if (videoSrc.startsWith("http")) video.crossOrigin = "anonymous";
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    let done = false;

    const timer = setTimeout(() => {
      if (!done) { done = true; video.src = ""; reject(new Error("Frame extraction timed out")); }
    }, 20000);

    const finish = (result: string) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      video.src = "";
      resolve(result);
    };
    const fail = (err: unknown) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      video.src = "";
      reject(err);
    };

    video.onloadeddata = () => {
      const dur = video.duration;
      if (!dur || !isFinite(dur)) { fail(new Error("Invalid duration")); return; }
      // Seek to last frame
      video.currentTime = Math.max(0, dur - 0.05);
    };

    video.onseeked = () => {
      // Wait for frame to actually decode before grabbing
      grabFrame(video).then(finish).catch(fail);
    };

    video.onerror = () => fail(new Error("Video load failed"));
    video.src = videoSrc;
    video.load();
  });
}

// ============================================================================
// ScenarioMode
// ============================================================================

interface ScenarioModeProps {
  onBack: () => void;
}

export function ScenarioMode({ onBack }: ScenarioModeProps) {
  // Project management
  const [activeProject, setActiveProject] = useState<ScenarioProject | null>(null);
  const [projects, setProjects] = useState<ScenarioProject[]>([]);
  const [showProjectPicker, setShowProjectPicker] = useState(true);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectPath, setNewProjectPath] = useState("");
  const [projectError, setProjectError] = useState<string | null>(null);
  const [isBrowsing, setIsBrowsing] = useState(false);

  // API key — read from provider settings (same as workflow editor), falls back to server .env
  const [xaiApiKey, setXaiApiKey] = useState<string | null>(null);

  // Input photo
  const [inputImage, setInputImage] = useState<string | null>(null);
  const [inputImagePath, setInputImagePath] = useState<string | null>(null);
  const [originalInputImage, setOriginalInputImage] = useState<string | null>(null);
  const [originalInputImagePath, setOriginalInputImagePath] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [inputAngleVariants, setInputAngleVariants] = useState<AngleVariant[]>([]);

  // Prompt & evasion
  const [prompt, setPrompt] = useState("");
  const [evasionTechnique, setEvasionTechnique] =
    useState<EvasionTechnique>("zwsp");
  const [evasionOutput, setEvasionOutput] = useState<string | null>(null);

  // Cinematic
  const [cinematicEnabled, setCinematicEnabled] = useState(true);
  const [cinematicState, setCinematicState] = useState<CinematicState>({
    camera: "static",
    lighting: null,
    lens: null,
    mood: null,
    color: null,
    body: "frozen",
    scene: new Set(["smooth-motion", "consistent-light"]),
  });
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [faceReferenceEnabled, setFaceReferenceEnabled] = useState(true);

  // Parameters
  const [duration, setDuration] = useState(12);
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [resolution, setResolution] = useState("480p");

  // Timeline
  const [clips, setClips] = useState<Clip[]>([]);
  const [activeClipId, setActiveClipId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [globalTime, setGlobalTime] = useState(0); // current playback position across all clips (seconds)
  const isPlayingRef = useRef(false); // ref mirror to avoid stale closures in rAF
  const isLoopingRef = useRef(false);
  const rafRef = useRef<number | null>(null);

  // Angle variants
  const [anglePickerClipId, setAnglePickerClipId] = useState<string | null>(null);
  const [anglePickerPos, setAnglePickerPos] = useState<{ x: number; y: number } | null>(null);
  const [anglePickerSourceImage, setAnglePickerSourceImage] = useState<string | null>(null);
  const [angleSubmenu, setAngleSubmenu] = useState<string | null>(null);
  const [angleSubmenuPos, setAngleSubmenuPos] = useState<{ x: number; y: number } | null>(null);
  const [isDraggingToTimeline, setIsDraggingToTimeline] = useState(false);
  const [showCustomAngleInput, setShowCustomAngleInput] = useState(false);
  const [customAnglePrompt, setCustomAnglePrompt] = useState("");
  const [previewImage, setPreviewImage] = useState<string | null>(null); // standalone image preview (frame/variant click)

  // Generating state
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const generateAbortRef = useRef<AbortController | null>(null);

  // Export state
  const { stitchVideos, progress: stitchProgress } = useStitchVideos();
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<StitchProgress | null>(null);

  // Loading from disk
  const [isLoaded, setIsLoaded] = useState(false);

  // Video playback ref
  const videoRef = useRef<HTMLVideoElement>(null);

  // Timeline scrubber ref
  const timelineTrackRef = useRef<HTMLDivElement>(null);

  const activeClip = clips.find((c) => c.id === activeClipId) || null;

  const playableClips = clips.filter((c) => c.status === "done" && c.videoSrc);
  const totalDuration = clips.reduce((sum, c) => sum + c.duration, 0);

  // Compute which clip a given global time falls in, and the local offset within that clip
  const getClipAtTime = useCallback((time: number): { clip: Clip; localTime: number } | null => {
    let accumulated = 0;
    for (const c of playableClips) {
      if (time < accumulated + c.duration) {
        return { clip: c, localTime: time - accumulated };
      }
      accumulated += c.duration;
    }
    return null;
  }, [playableClips]);

  // Get the global start time of a given clip
  const getClipStartTime = useCallback((clipId: string): number => {
    let accumulated = 0;
    for (const c of playableClips) {
      if (c.id === clipId) return accumulated;
      accumulated += c.duration;
    }
    return 0;
  }, [playableClips]);

  // Load API key from provider settings
  useEffect(() => {
    const settings = getProviderSettings();
    const key = settings.providers.xai?.apiKey;
    if (key) setXaiApiKey(key);
  }, []);

  // Load projects list and check for last active project
  useEffect(() => {
    const saved = loadProjects();
    setProjects(saved);
    const lastId = localStorage.getItem("node-banana-scenario-active");
    const last = saved.find((p) => p.id === lastId);
    if (last) {
      openProject(last);
    }
  }, []);

  const openProject = useCallback((project: ScenarioProject) => {
    setActiveProject(project);
    setShowProjectPicker(false);
    localStorage.setItem("node-banana-scenario-active", project.id);
    loadScenarioStateFromDisk(project.directoryPath).then((saved) => {
      if (saved) {
        setInputImage(saved.inputImage ?? null);
        setInputImagePath(saved.inputImagePath ?? null);
        setOriginalInputImage(saved.originalInputImage ?? saved.inputImage ?? null);
        setOriginalInputImagePath(saved.originalInputImagePath ?? saved.inputImagePath ?? null);
        setInputAngleVariants(saved.inputAngleVariants ?? []);
        setPrompt(saved.prompt ?? "");
        setEvasionTechnique(saved.evasionTechnique ?? "zwsp");
        // Recompute evasion output from saved state
        if (saved.prompt?.trim()) {
          setEvasionOutput(applyEvasion(saved.prompt, saved.evasionTechnique ?? "zwsp"));
        } else {
          setEvasionOutput(null);
        }
        setCinematicEnabled(saved.cinematicEnabled ?? true);
        setCinematicState(saved.cinematicState);
        setDuration(saved.duration ?? 12);
        setAspectRatio(saved.aspectRatio ?? "9:16");
        setResolution(saved.resolution ?? "480p");
        setClips(saved.clips ?? []);
        setActiveClipId(saved.activeClipId ?? null);
      } else {
        resetState();
      }
      setIsLoaded(true);
    });
  }, []);

  const resetState = useCallback(() => {
    setInputImage(null);
    setInputImagePath(null);
    setOriginalInputImage(null);
    setOriginalInputImagePath(null);
    setInputAngleVariants([]);
    setPrompt("");
    setEvasionTechnique("zwsp");
    setEvasionOutput(null);
    setCinematicEnabled(true);
    setCinematicState({
      camera: "static",
      lighting: null,
      lens: null,
      mood: null,
      color: null,
      body: "frozen",
      scene: new Set(["smooth-motion", "consistent-light"]),
    });
    setDuration(12);
    setAspectRatio("9:16");
    setResolution("480p");
    setClips([]);
    setActiveClipId(null);
    setGenerationError(null);
  }, []);

  const handleCreateProject = useCallback(async () => {
    if (!newProjectName.trim()) {
      setProjectError("Project name is required");
      return;
    }
    if (!newProjectPath.trim()) {
      setProjectError("Project directory is required");
      return;
    }

    const project: ScenarioProject = {
      id: `scenario-${Date.now()}`,
      name: newProjectName.trim(),
      directoryPath: newProjectPath.trim(),
      createdAt: new Date().toISOString(),
    };

    const updated = [...projects, project];
    setProjects(updated);
    saveProjects(updated);
    setNewProjectName("");
    setNewProjectPath("");
    setProjectError(null);
    openProject(project);
  }, [newProjectName, newProjectPath, projects, openProject]);

  const handleBrowse = useCallback(async () => {
    setIsBrowsing(true);
    try {
      const res = await fetch("/api/browse-directory");
      const result = await res.json();
      if (result.success && result.path) {
        setNewProjectPath(result.path);
      }
    } catch {
      // ignore
    } finally {
      setIsBrowsing(false);
    }
  }, []);

  // Auto-save state to disk on every change (debounced)
  useEffect(() => {
    if (!isLoaded || !activeProject) return;
    saveScenarioStateToDisk(activeProject.directoryPath, {
      inputImagePath,
      originalInputImagePath,
      inputAngleVariants,
      prompt,
      evasionTechnique,
      cinematicEnabled,
      cinematicState,
      duration,
      aspectRatio,
      resolution,
      useLastFrame: true,
      clips,
      activeClipId,
    });
  }, [isLoaded, activeProject, inputImagePath, originalInputImagePath, inputAngleVariants, prompt, evasionTechnique, cinematicEnabled, cinematicState, duration, aspectRatio, resolution, clips, activeClipId]);

  // ---- Handlers ----

  const handleNewScenario = useCallback(() => {
    setActiveProject(null);
    setIsLoaded(false);
    setShowProjectPicker(true);
    localStorage.removeItem("node-banana-scenario-active");
    resetState();
  }, [resetState]);

  // Crop image to target aspect ratio (center crop) using canvas
  const cropToAspect = useCallback((dataUrl: string, targetRatio: number): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const srcW = img.naturalWidth;
        const srcH = img.naturalHeight;
        const srcRatio = srcW / srcH;

        let cropW: number, cropH: number, cropX: number, cropY: number;
        if (srcRatio > targetRatio) {
          // Image is wider — crop sides
          cropH = srcH;
          cropW = Math.round(srcH * targetRatio);
          cropX = Math.round((srcW - cropW) / 2);
          cropY = 0;
        } else {
          // Image is taller — crop top/bottom
          cropW = srcW;
          cropH = Math.round(srcW / targetRatio);
          cropX = 0;
          cropY = Math.round((srcH - cropH) / 2);
        }

        const canvas = document.createElement("canvas");
        canvas.width = cropW;
        canvas.height = cropH;
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("No canvas context")); return; }
        ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = () => reject(new Error("Failed to load image for crop"));
      img.src = dataUrl;
    });
  }, []);

  // Save uploaded image to project inputs/ folder on disk
  const saveInputImage = useCallback(async (dataUrl: string) => {
    // Parse aspect ratio to number (e.g. "9:16" → 9/16 = 0.5625)
    const [w, h] = aspectRatio.split(":").map(Number);
    const targetRatio = w / h;
    try {
      dataUrl = await cropToAspect(dataUrl, targetRatio);
    } catch {
      // If crop fails, use original
    }
    setOriginalInputImage(dataUrl);
    if (!activeProject) {
      setInputImage(dataUrl);
      setInputImagePath(null);
      return;
    }
    const inputsDir = `${activeProject.directoryPath}/inputs`;
    const imageId = `input_${Date.now()}`;
    try {
      const res = await fetch("/api/save-generation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          directoryPath: inputsDir,
          image: dataUrl,
          prompt: "scenario-input",
          customFilename: imageId,
          createDirectory: true,
        }),
      });
      const result = await res.json();
      if (result.success && result.filePath) {
        const relativePath = `inputs/${result.filename}`;
        setInputImagePath(relativePath);
        setOriginalInputImagePath(relativePath);
        setInputImage(imageUrl(result.filePath));
      } else {
        setInputImage(dataUrl);
        setInputImagePath(null);
        setOriginalInputImagePath(null);
      }
    } catch {
      setInputImage(dataUrl);
      setInputImagePath(null);
    }
  }, [activeProject, aspectRatio, cropToAspect]);

  const handleImageUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        saveInputImage(ev.target?.result as string);
      };
      reader.readAsDataURL(file);
      e.target.value = "";
    },
    [saveInputImage]
  );

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      saveInputImage(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
  }, [saveInputImage]);

  // Build the full prompt (evasion output + cinematic suffix)
  const buildFullPrompt = useCallback(() => {
    let result = evasionOutput || prompt;
    if (cinematicEnabled) {
      const parts = [BASE_CONTINUITY];
      for (const group of CINEMATIC_GROUPS) {
        if (group.multiSelect) {
          for (const opt of group.options) {
            if (cinematicState.scene.has(opt.id)) parts.push(opt.prompt);
          }
        } else {
          const key = group.id as keyof Omit<CinematicState, "scene">;
          const activeId = cinematicState[key];
          if (activeId) {
            const opt = group.options.find((o) => o.id === activeId);
            if (opt) parts.push(opt.prompt);
          }
        }
      }
      result += ". " + parts.join(", ");
    }
    return result;
  }, [prompt, evasionOutput, cinematicEnabled, cinematicState]);

  // Real xAI video generation
  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) {
      setGenerationError("Prompt is required");
      return;
    }

    setIsGenerating(true);
    setGenerationError(null);
    const abortController = new AbortController();
    generateAbortRef.current = abortController;

    const clipId = `clip-${Date.now()}`;
    const fullPrompt = buildFullPrompt();

    // Create placeholder clip
    const placeholderClip: Clip = {
      id: clipId,
      thumbnail: null,
      thumbnailPath: null,
      videoSrc: null,
      videoPath: null,
      lastFrame: null,
      lastFramePath: null,
      duration,
      prompt: fullPrompt,
      rawPrompt: prompt,
      evasionTechnique,
      angleVariants: [],
      status: "generating",
    };
    setClips((prev) => [...prev, placeholderClip]);
    setActiveClipId(clipId);

    try {
      // Resolve input image to a usable URL for the API
      // For I2V we need to send the image — if it's an API URL, fetch it as data URL first
      let imageForApi: string | null = null;
      if (inputImage) {
        if (inputImage.startsWith("data:")) {
          imageForApi = inputImage;
        } else if (inputImage.startsWith("/api/")) {
          // Fetch from our local API and convert to data URL
          const imgRes = await fetch(inputImage);
          const blob = await imgRes.blob();
          imageForApi = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
        } else {
          imageForApi = inputImage;
        }
      }

      // Appearance reference composite for video generation
      // When enabled and the current input differs from the original upload,
      // composite the original face alongside the input so the AI preserves identity
      let promptForVideo = fullPrompt;
      if (faceReferenceEnabled && imageForApi) {
        const refImage = originalInputImage || inputImage;
        if (refImage && refImage !== inputImage) {
          try {
            const refDataUrl = await resolveToDataUrl(refImage);
            imageForApi = await compositeWithReference(imageForApi, refDataUrl);
            promptForVideo = `IMPORTANT: The input contains TWO images side by side, separated by a white vertical line. The LARGE image on the LEFT is the scene to animate as video. The SMALL image on the RIGHT is ONLY a reference showing the person's full appearance — do NOT include it in the output, do NOT generate a split or composite video. Output a SINGLE video that animates the LEFT scene only. Use the RIGHT reference to maintain EXACT consistency throughout the entire video of: face, skin tone, hair style and color, makeup, clothing, accessories (jewelry, watches, glasses, hats, bags, belts), tattoos, and every other visible detail of the person's appearance. ${fullPrompt}`;
          } catch {
            // Composite failed — proceed with just the input image
          }
        }
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (xaiApiKey) headers["X-XAI-Key"] = xaiApiKey;

      const response = await fetch("/api/generate", {
        method: "POST",
        headers,
        signal: abortController.signal,
        body: JSON.stringify({
          prompt: promptForVideo,
          images: imageForApi ? [imageForApi] : [],
          selectedModel: {
            provider: "xai",
            modelId: "grok-imagine-video",
            displayName: "Grok Video",
          },
          parameters: {
            duration,
            aspect_ratio: aspectRatio,
            resolution,
          },
          mediaType: "video",
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Generation failed");
      }

      // Get video data — either base64 or URL
      const videoData = result.video || result.videoUrl;
      if (!videoData) {
        throw new Error("No video data in response");
      }

      // Convert to blob URL for playback if base64
      let videoSrc: string;
      if (videoData.startsWith("data:")) {
        const byteString = atob(videoData.split(",")[1]);
        const mimeString = videoData.split(",")[0].split(":")[1].split(";")[0];
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
        const blob = new Blob([ab], { type: mimeString });
        videoSrc = URL.createObjectURL(blob);
      } else {
        // HTTP URL from provider
        videoSrc = videoData;
      }

      // Save video to disk
      let videoPath: string | null = null;
      let thumbnailPath: string | null = null;
      let thumbnailUrl: string | null = null;
      let lastFrameDataUrl: string | null = null;
      let lastFrameUrl: string | null = null;
      let lastFrameRelPath: string | null = null;

      if (activeProject) {
        const genDir = `${activeProject.directoryPath}/generations`;
        const videoId = `clip_${Date.now()}`;
        try {
          const saveRes = await fetch("/api/save-generation", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              directoryPath: genDir,
              video: videoData,
              prompt: fullPrompt,
              customFilename: videoId,
              createDirectory: true,
            }),
          });
          const saveResult = await saveRes.json();
          if (saveResult.success && saveResult.filePath) {
            videoPath = `generations/${saveResult.filename}`;
          }
        } catch {
          // Video saved in memory, disk save failed
        }

      }

      // First update clip with video so it renders in the DOM
      setClips((prev) =>
        prev.map((c) =>
          c.id === clipId
            ? {
                ...c,
                videoSrc,
                videoPath,
                thumbnail: inputImage,
                thumbnailPath: inputImagePath,
                lastFrame: null,
                lastFramePath: null,
                status: "done" as const,
              }
            : c
        )
      );

      // Extract last frame from the video (creates its own video element, seeks to end)
      try {
        lastFrameDataUrl = await extractLastFrame(videoSrc);
      } catch (e) {
        console.error("Frame extraction failed:", e);
      }

      // Save frame and update clip + input
      if (lastFrameDataUrl && activeProject) {
        try {
          const frameDir = `${activeProject.directoryPath}/frames`;
          const frameId = `lastframe_${Date.now()}`;
          const frameRes = await fetch("/api/save-generation", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              directoryPath: frameDir,
              image: lastFrameDataUrl,
              prompt: "last-frame",
              customFilename: frameId,
              createDirectory: true,
            }),
          });
          const frameResult = await frameRes.json();
          if (frameResult.success && frameResult.filePath) {
            lastFrameRelPath = `frames/${frameResult.filename}`;
            lastFrameUrl = imageUrl(frameResult.filePath);
          }
        } catch {
          // Disk save failed — still use data URL in memory
        }

        const frameDisplay = lastFrameUrl || lastFrameDataUrl;
        const framePath = lastFrameRelPath;

        // Update clip with frame data
        setClips((prev) =>
          prev.map((c) =>
            c.id === clipId
              ? {
                  ...c,
                  thumbnail: frameDisplay || c.thumbnail,
                  thumbnailPath: framePath || c.thumbnailPath,
                  lastFrame: frameDisplay,
                  lastFramePath: framePath,
                }
              : c
          )
        );

        // Set as next input for chaining
        if (frameDisplay) {
          setInputImagePath(framePath);
          setInputImage(frameDisplay);
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // Cancelled — remove the placeholder clip
        setClips((prev) => prev.filter((c) => c.id !== clipId));
        setGenerationError(null);
      } else {
        const errorMsg = err instanceof Error ? err.message : "Generation failed";
        setGenerationError(errorMsg);
        setClips((prev) =>
          prev.map((c) =>
            c.id === clipId
              ? { ...c, status: "error" as const, error: errorMsg }
              : c
          )
        );
      }
    } finally {
      setIsGenerating(false);
      generateAbortRef.current = null;
    }
  }, [prompt, xaiApiKey, buildFullPrompt, duration, aspectRatio, resolution, inputImage, inputImagePath, activeProject]);

  // Generate an angle variant image from a clip's last frame or a variant image
  const handleGenerateAngle = useCallback(async (clipId: string, presetId: string, sourceImage?: string, customPrompt?: string) => {
    const isInputImage = clipId === "__input__";
    const clip = isInputImage ? null : clips.find((c) => c.id === clipId);
    const imgSrc = sourceImage || (isInputImage ? (originalInputImage || inputImage) : clip?.lastFrame);
    if (!imgSrc) return;

    const basePreset = presetId === "custom"
      ? { id: "custom", label: "Custom", group: undefined as string | undefined, prompt: `${customPrompt}. ${CUSTOM_LOCK}` }
      : ANGLE_PRESETS.find((p) => p.id === presetId);
    if (!basePreset) return;

    // Inject active Body cinematic prompt for person-related presets
    let finalPrompt = basePreset.prompt;
    if (cinematicState.body) {
      const bodyOpt = CINEMATIC_GROUPS.find((g) => g.id === "body")?.options.find((o) => o.id === cinematicState.body);
      if (bodyOpt) {
        finalPrompt += `. ${bodyOpt.prompt}`;
      }
    }
    const preset = { ...basePreset, prompt: finalPrompt };

    setAnglePickerClipId(null);
    setAnglePickerPos(null);
    setAnglePickerSourceImage(null);
    setAngleSubmenu(null);
    setShowCustomAngleInput(false);
    setCustomAnglePrompt("");

    const variantId = `angle-${Date.now()}`;
    const newVariant: AngleVariant = {
      id: variantId,
      clipId,
      presetId,
      image: null,
      imagePath: null,
      status: "generating",
    };

    // Add variant to clip or input variants
    if (isInputImage) {
      setInputAngleVariants((prev) => [...prev, newVariant]);
    } else {
      setClips((prev) =>
        prev.map((c) =>
          c.id === clipId
            ? { ...c, angleVariants: [...c.angleVariants, newVariant] }
            : c
        )
      );
    }

    try {
      // Resolve source image for API
      let frameForApi = await resolveToDataUrl(imgSrc);

      // If we have an original face reference that differs from current source,
      // composite them side by side so the AI can maintain identity
      let promptForApi = preset.prompt;
      const refImage = originalInputImage || inputImage;
      if (faceReferenceEnabled && refImage && refImage !== imgSrc) {
        try {
          const refDataUrl = await resolveToDataUrl(refImage);
          frameForApi = await compositeWithReference(frameForApi, refDataUrl);
          promptForApi = `IMPORTANT: The input contains TWO images side by side, separated by a white vertical line. The LARGE image on the LEFT is the scene to edit and transform. The SMALL image on the RIGHT is ONLY a reference showing the person's full appearance — do NOT include it in the output, do NOT generate a split or composite image. Output a SINGLE image that is a transformation of the LEFT scene only. Use the RIGHT reference to maintain EXACT consistency of: face, skin tone, hair style and color, makeup, clothing, accessories (jewelry, watches, glasses, hats, bags, belts), tattoos, and every other visible detail of the person's appearance. ${promptForApi}`;
        } catch {
          // Composite failed — proceed with just the source image
        }
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (xaiApiKey) headers["X-XAI-Key"] = xaiApiKey;

      const response = await fetch("/api/generate", {
        method: "POST",
        headers,
        body: JSON.stringify({
          prompt: promptForApi,
          images: [frameForApi],
          selectedModel: {
            provider: "xai",
            modelId: "grok-imagine-image",
            displayName: "Grok Image",
          },
          parameters: {
            aspect_ratio: aspectRatio,
          },
          mediaType: "image",
        }),
      });

      const result = await response.json();
      if (!result.success) throw new Error(result.error || "Generation failed");

      const imageData = result.image || result.imageUrl;
      if (!imageData) throw new Error("No image data in response");

      // Save to disk
      let imagePath: string | null = null;
      let imageDisplay: string = imageData;

      if (activeProject) {
        try {
          const anglesDir = `${activeProject.directoryPath}/angles`;
          const angleId = `angle_${Date.now()}`;
          const saveRes = await fetch("/api/save-generation", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              directoryPath: anglesDir,
              image: imageData,
              prompt: preset.prompt,
              customFilename: angleId,
              createDirectory: true,
            }),
          });
          const saveResult = await saveRes.json();
          if (saveResult.success && saveResult.filePath) {
            imagePath = `angles/${saveResult.filename}`;
            imageDisplay = imageUrl(saveResult.filePath);
          }
        } catch {
          // Disk save failed, use in-memory
        }
      }

      // Update variant as done
      const updateDone = (av: AngleVariant) =>
        av.id === variantId ? { ...av, image: imageDisplay, imagePath, status: "done" as const } : av;

      if (isInputImage) {
        setInputAngleVariants((prev) => prev.map(updateDone));
      } else {
        setClips((prev) =>
          prev.map((c) =>
            c.id === clipId
              ? { ...c, angleVariants: c.angleVariants.map(updateDone) }
              : c
          )
        );
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Angle generation failed";
      const updateErr = (av: AngleVariant) =>
        av.id === variantId ? { ...av, status: "error" as const, error: errorMsg } : av;

      if (isInputImage) {
        setInputAngleVariants((prev) => prev.map(updateErr));
      } else {
        setClips((prev) =>
          prev.map((c) =>
            c.id === clipId
              ? { ...c, angleVariants: c.angleVariants.map(updateErr) }
              : c
          )
        );
      }
    }
  }, [clips, xaiApiKey, activeProject, aspectRatio, originalInputImage, inputImage, cinematicState, faceReferenceEnabled]);

  // Stop playback and animation loop
  const stopPlayback = useCallback(() => {
    isPlayingRef.current = false;
    setIsPlaying(false);
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const video = videoRef.current;
    if (video && !video.paused) video.pause();
  }, []);

  const handleClipClick = useCallback((clipId: string) => {
    stopPlayback();
    setActiveClipId(clipId);
    setPreviewImage(null);
    setGlobalTime(getClipStartTime(clipId));
    // Load clip's prompt/technique into the editable form
    const clip = clips.find((c) => c.id === clipId);
    if (clip) {
      setPrompt(clip.rawPrompt);
      setEvasionTechnique(clip.evasionTechnique);
      setEvasionOutput(clip.prompt !== clip.rawPrompt ? clip.prompt : applyEvasion(clip.rawPrompt, clip.evasionTechnique));
    }
  }, [clips, getClipStartTime, stopPlayback]);

  const handleDeleteClip = useCallback((clipId: string) => {
    stopPlayback();
    setClips((prev) => {
      const filtered = prev.filter((c) => c.id !== clipId);
      // If we deleted the active clip, select the previous one or clear
      if (activeClipId === clipId) {
        const idx = prev.findIndex((c) => c.id === clipId);
        const next = filtered[Math.max(0, idx - 1)];
        setActiveClipId(next?.id ?? null);
      }
      return filtered;
    });
    setGlobalTime(0);
  }, [activeClipId, stopPlayback]);

  // Export all clips as a single video
  const handleExport = useCallback(async () => {
    if (playableClips.length === 0 || isExporting) return;

    setIsExporting(true);
    setExportProgress(null);
    stopPlayback();

    try {
      // Fetch all clip videos as blobs
      const blobs: Blob[] = [];
      for (const clip of playableClips) {
        if (!clip.videoSrc) continue;
        const res = await fetch(clip.videoSrc);
        const blob = await res.blob();
        blobs.push(blob);
      }

      if (blobs.length === 0) throw new Error("No video data to export");

      // Stitch videos together
      const result = await stitchVideos(blobs, null, (p) => {
        setExportProgress(p);
      });

      if (!result) throw new Error("Stitching failed");

      // Trigger browser download
      const url = URL.createObjectURL(result);
      const a = document.createElement("a");
      a.href = url;
      a.download = `scenario_export_${Date.now()}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Also save to project exports folder
      if (activeProject) {
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            await fetch("/api/save-generation", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                directoryPath: `${activeProject.directoryPath}/exports`,
                video: reader.result as string,
                prompt: "scenario-export",
                customFilename: `export_${Date.now()}`,
                createDirectory: true,
              }),
            });
          } catch { /* disk save optional */ }
        };
        reader.readAsDataURL(result);
      }

      setExportProgress({ status: "complete", message: "Export complete!", progress: 100 });
      setTimeout(() => { setExportProgress(null); setIsExporting(false); }, 3000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Export failed";
      setExportProgress({ status: "error", message: msg, progress: 0, error: msg });
      setTimeout(() => { setExportProgress(null); setIsExporting(false); }, 5000);
    }
  }, [playableClips, isExporting, stopPlayback, stitchVideos, activeProject]);

  // Start sequential playback from current globalTime
  const startPlayback = useCallback(() => {
    if (playableClips.length === 0) return;

    const totalPlayable = playableClips.reduce((s, c) => s + c.duration, 0);

    // If at end, restart from beginning
    if (globalTime >= totalPlayable - 0.1) {
      setGlobalTime(0);
      prevClipRef.current = null;
      setActiveClipId(playableClips[0]?.id ?? null);
    }

    isPlayingRef.current = true;
    setIsPlaying(true);

    const target = getClipAtTime(globalTime >= totalPlayable - 0.1 ? 0 : globalTime);
    if (target && activeClipId !== target.clip.id) {
      setActiveClipId(target.clip.id);
    }

    let lastTimestamp: number | null = null;

    const tick = (timestamp: number) => {
      if (!isPlayingRef.current) return;

      if (lastTimestamp === null) lastTimestamp = timestamp;
      const delta = (timestamp - lastTimestamp) / 1000;
      lastTimestamp = timestamp;

      setGlobalTime((prev) => {
        const next = prev + delta;
        if (next >= totalPlayable) {
          if (isLoopingRef.current) {
            // Loop — restart from beginning
            prevClipRef.current = null;
            setActiveClipId(playableClips[0]?.id ?? null);
            return 0;
          }
          // End — stop
          isPlayingRef.current = false;
          setIsPlaying(false);
          return totalPlayable;
        }
        return next;
      });

      rafRef.current = requestAnimationFrame(tick);
    };

    // Small delay to let React render the video element if clip changed
    requestAnimationFrame(() => {
      const video = videoRef.current;
      if (video) {
        const t = getClipAtTime(globalTime >= totalPlayable - 0.1 ? 0 : globalTime);
        if (t) video.currentTime = t.localTime;
        video.play().catch(() => {});
      }
      rafRef.current = requestAnimationFrame(tick);
    });
  }, [playableClips, globalTime, activeClipId, getClipAtTime]);

  // Track which clip is active based on globalTime — only switch when needed
  const prevClipRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isPlayingRef.current) return;

    const target = getClipAtTime(globalTime);
    if (!target) {
      stopPlayback();
      return;
    }

    // Only act when clip changes
    if (prevClipRef.current !== target.clip.id) {
      prevClipRef.current = target.clip.id;
      setActiveClipId(target.clip.id);

      // Wait for React to render the new video src, then play
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const video = videoRef.current;
          if (video && isPlayingRef.current) {
            video.currentTime = target.localTime;
            video.play().catch(() => {});
          }
        });
      });
    } else {
      // Same clip — just ensure it's playing, don't seek (let it play naturally)
      const video = videoRef.current;
      if (video && video.paused && isPlayingRef.current) {
        video.play().catch(() => {});
      }
    }
  }, [globalTime, getClipAtTime, stopPlayback]);

  // Cleanup rAF on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore when typing in inputs
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.code === "Space") {
        e.preventDefault();
        if (isPlayingRef.current) {
          stopPlayback();
        } else {
          startPlayback();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [stopPlayback, startPlayback]);

  // Toggle play/pause
  const togglePlayback = useCallback(() => {
    if (isPlaying) {
      stopPlayback();
    } else {
      startPlayback();
    }
  }, [isPlaying, stopPlayback, startPlayback]);

  // Seek to a global time position
  const seekTo = useCallback((time: number) => {
    const wasPlaying = isPlayingRef.current;
    stopPlayback();

    const clamped = Math.max(0, Math.min(time, totalDuration));
    setGlobalTime(clamped);

    const target = getClipAtTime(clamped);
    if (target) {
      setActiveClipId(target.clip.id);
      // Seek the video element after render
      requestAnimationFrame(() => {
        const video = videoRef.current;
        if (video) {
          video.currentTime = target.localTime;
        }
      });
    }

    if (wasPlaying) {
      // Resume playback after seek
      requestAnimationFrame(() => startPlayback());
    }
  }, [stopPlayback, totalDuration, getClipAtTime, startPlayback]);

  // Scrubber drag state
  const isScrubbing = useRef(false);
  const wasPlayingBeforeScrub = useRef(false);

  const scrubFromEvent = useCallback((clientX: number) => {
    const track = timelineTrackRef.current;
    if (!track || totalDuration === 0) return;

    const rect = track.getBoundingClientRect();
    const x = clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, x / rect.width));
    const playableDuration = playableClips.reduce((s, c) => s + c.duration, 0);
    const time = ratio * playableDuration;

    const clamped = Math.max(0, Math.min(time, playableDuration));
    setGlobalTime(clamped);

    const target = getClipAtTime(clamped);
    if (target) {
      if (activeClipId !== target.clip.id) {
        setActiveClipId(target.clip.id);
      }
      // Seek the video element immediately for real-time preview
      requestAnimationFrame(() => {
        const video = videoRef.current;
        if (video) {
          video.currentTime = target.localTime;
          if (!video.paused) video.pause();
        }
      });
    }
  }, [totalDuration, playableClips, getClipAtTime, activeClipId]);

  const handleScrubStart = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    isScrubbing.current = true;
    wasPlayingBeforeScrub.current = isPlayingRef.current;
    if (isPlayingRef.current) stopPlayback();
    scrubFromEvent(e.clientX);

    const handleMove = (ev: MouseEvent) => {
      if (isScrubbing.current) scrubFromEvent(ev.clientX);
    };
    const handleUp = () => {
      isScrubbing.current = false;
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
      if (wasPlayingBeforeScrub.current) {
        requestAnimationFrame(() => startPlayback());
      }
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  }, [scrubFromEvent, stopPlayback, startPlayback]);

  // ---- Render ----

  // Project picker
  if (showProjectPicker) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-neutral-950 text-neutral-100">
        <div className="w-full max-w-lg mx-4 bg-neutral-800 rounded-xl border border-neutral-700 shadow-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-medium">Scenario Mode</h2>
            <button
              onClick={onBack}
              className="text-xs text-neutral-400 hover:text-neutral-200 transition-colors"
            >
              Back to Workflows
            </button>
          </div>

          {/* Existing projects */}
          {projects.length > 0 && (
            <div className="mb-6">
              <h3 className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-2">
                Recent Projects
              </h3>
              <div className="space-y-1.5">
                {projects.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => openProject(p)}
                    className="w-full text-left p-3 rounded-lg border border-neutral-700/50 hover:border-neutral-600 hover:bg-neutral-800/40 transition-all"
                  >
                    <div className="text-sm font-medium text-neutral-200">{p.name}</div>
                    <div className="text-[10px] text-neutral-500 mt-0.5 truncate">{p.directoryPath}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* New project form */}
          <div className="border-t border-neutral-700 pt-4">
            <h3 className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-3">
              New Project
            </h3>
            <div className="space-y-3">
              <input
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="Project name"
                autoFocus
                className="w-full px-3 py-2 bg-neutral-900 border border-neutral-600 rounded-lg text-sm text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:border-neutral-500"
              />
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newProjectPath}
                  onChange={(e) => setNewProjectPath(e.target.value)}
                  placeholder="/Users/username/projects/my-scenario"
                  className="flex-1 px-3 py-2 bg-neutral-900 border border-neutral-600 rounded-lg text-sm text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:border-neutral-500"
                />
                <button
                  onClick={handleBrowse}
                  disabled={isBrowsing}
                  className="px-3 py-2 bg-neutral-700 hover:bg-neutral-600 disabled:opacity-50 text-sm text-neutral-200 rounded-lg transition-colors"
                >
                  {isBrowsing ? "..." : "Browse"}
                </button>
              </div>
              <p className="text-[10px] text-neutral-500">
                Scenario state and generated clips will be saved here.
              </p>
              {projectError && (
                <p className="text-xs text-red-400">{projectError}</p>
              )}
              <button
                onClick={handleCreateProject}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium text-white transition-colors"
              >
                Create Project
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-neutral-950 text-neutral-100 overflow-hidden">
      {/* Main 3-column area */}
      <div className="flex-1 flex min-h-0">
        {/* ================================================================ */}
        {/* LEFT PANEL - Collapsed after upload, full when no image */}
        {/* ================================================================ */}
        {inputImage ? (
          <div className="w-[48px] flex-shrink-0 bg-neutral-900 border-r border-neutral-800 flex flex-col items-center py-2 gap-3">
            <button
              onClick={onBack}
              className="text-neutral-500 hover:text-neutral-200 transition-colors"
              title="Back"
            >
              <ArrowLeftIcon className="w-4 h-4" />
            </button>
            <button
              onClick={handleNewScenario}
              className="text-neutral-500 hover:text-neutral-200 transition-colors"
              title="New scenario"
            >
              <PlusIcon className="w-4 h-4" />
            </button>
            <div className="flex-1" />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-neutral-500 hover:text-neutral-200 transition-colors"
              title="Upload new image"
            >
              <ArrowUpTrayIcon className="w-4 h-4" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
          </div>
        ) : (
          <div className="w-[350px] flex-shrink-0 bg-neutral-900 border-r border-neutral-800 flex flex-col">
            <div className="px-3 py-2 border-b border-neutral-800 flex items-center justify-between">
              <button
                onClick={onBack}
                className="flex items-center gap-1 text-[10px] text-neutral-500 hover:text-neutral-200 transition-colors"
              >
                <ArrowLeftIcon className="w-3 h-3" />
                Back
              </button>
              <span className="text-[10px] font-medium text-neutral-400 uppercase tracking-wider">
                Input
              </span>
              <button
                onClick={handleNewScenario}
                className="flex items-center gap-1 text-[10px] text-neutral-500 hover:text-neutral-200 transition-colors"
              >
                <PlusIcon className="w-3 h-3" />
                New
              </button>
            </div>

            <div className="flex-1 px-3 py-2 flex flex-col min-h-0">
              <div
                className="flex-1 flex flex-col items-center justify-center rounded-xl cursor-pointer transition-colors bg-neutral-800/30 border-2 border-dashed border-neutral-700 hover:border-neutral-600"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
              >
                <ArrowUpTrayIcon className="w-8 h-8 text-neutral-600 mb-2" />
                <span className="text-xs text-neutral-500">
                  Drop image here
                </span>
                <span className="text-[10px] text-neutral-600 mt-1">
                  or click to upload
                </span>
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
          </div>
        )}

        {/* ================================================================ */}
        {/* CENTER PANEL - Video Preview */}
        {/* ================================================================ */}
        <div className="flex-1 flex flex-col items-center justify-center bg-neutral-950 min-h-0 relative">
          {isExporting && exportProgress ? (
            <div className="flex flex-col items-center gap-4 px-8 max-w-md">
              <ArrowDownTrayIcon className="w-10 h-10 text-blue-500" />
              <span className="text-sm text-neutral-300">
                {exportProgress.status === "complete" ? "Export complete!" : exportProgress.status === "error" ? "Export failed" : "Exporting video..."}
              </span>
              <div className="w-full bg-neutral-800 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    exportProgress.status === "error" ? "bg-red-500" : exportProgress.status === "complete" ? "bg-green-500" : "bg-blue-500"
                  }`}
                  style={{ width: `${exportProgress.progress}%` }}
                />
              </div>
              <span className="text-[10px] text-neutral-500">{exportProgress.message}</span>
            </div>
          ) : activeClip?.status === "error" ? (
            <div className="flex flex-col items-center gap-3 max-w-md px-6">
              <ExclamationTriangleIcon className="w-10 h-10 text-red-500/70" />
              <span className="text-sm text-red-400 text-center">{activeClip.error}</span>
              <button
                onClick={() => {
                  setClips((prev) => prev.filter((c) => c.id !== activeClip.id));
                  setActiveClipId(null);
                }}
                className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
              >
                Dismiss
              </button>
            </div>
          ) : activeClip?.videoSrc ? (
            <div className="flex flex-col items-center gap-3 max-h-full p-6">
              <div className="flex-1 min-h-0 flex items-center justify-center relative group cursor-pointer" onClick={togglePlayback}>
                <div className="relative max-w-full max-h-[calc(100vh-280px)]" style={{ aspectRatio: aspectRatio.replace(":", "/") }}>
                  {/* Static thumbnail behind video to prevent flash */}
                  {activeClip.thumbnail && (
                    <img
                      src={activeClip.thumbnail}
                      alt=""
                      className="absolute inset-0 w-full h-full object-contain rounded-lg"
                    />
                  )}
                  <video
                    ref={videoRef}
                    src={activeClip.videoSrc}
                    className="relative w-full h-full object-contain rounded-lg"
                    playsInline
                    muted={false}
                    preload="auto"
                  />
                </div>
                {/* Play/Pause overlay */}
                {!isPlaying && (
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="w-14 h-14 bg-black/60 rounded-full flex items-center justify-center backdrop-blur-sm">
                      <PlayIconSolid className="w-6 h-6 text-white ml-0.5" />
                    </div>
                  </div>
                )}
              </div>
              <div className="text-xs text-neutral-500">
                Clip {clips.findIndex((c) => c.id === activeClip.id) + 1} /{" "}
                {activeClip.duration}s / Grok Video
              </div>
            </div>
          ) : activeClip?.thumbnail ? (
            <div className="flex flex-col items-center gap-3 max-h-full p-6">
              <div className="flex-1 min-h-0 flex items-center justify-center">
                <img
                  src={activeClip.thumbnail}
                  alt="Preview"
                  className="max-w-full max-h-[calc(100vh-280px)] rounded-lg"
                />
              </div>
              <div className="text-xs text-neutral-500">
                Clip {clips.findIndex((c) => c.id === activeClip.id) + 1} /{" "}
                {activeClip.duration}s / Grok Video
              </div>
            </div>
          ) : previewImage && !activeClipId ? (
            <div className="flex flex-col items-center gap-3 max-h-full p-6">
              <div className="flex-1 min-h-0 flex items-center justify-center">
                <img
                  src={previewImage}
                  alt="Preview"
                  className="max-w-full max-h-[calc(100vh-280px)] rounded-lg"
                />
              </div>
              <div className="text-xs text-neutral-500">
                Preview
              </div>
            </div>
          ) : inputImage && !activeClipId ? (
            <div className="flex flex-col items-center gap-3 max-h-full p-6">
              <div className="flex-1 min-h-0 flex items-center justify-center">
                <img
                  src={inputImage}
                  alt="Input reference"
                  className="max-w-full max-h-[calc(100vh-280px)] rounded-lg"
                />
              </div>
              <div className="text-xs text-neutral-500">
                Input image
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-full border border-neutral-800 flex items-center justify-center">
                <PlayIconSolid className="w-7 h-7 text-neutral-700 ml-0.5" />
              </div>
              <span className="text-sm text-neutral-600">
                Generate your first clip
              </span>
            </div>
          )}

          {/* Generation error banner */}
          {generationError && !isGenerating && (
            <div className="absolute bottom-4 left-4 right-4 bg-red-950/80 border border-red-800/50 rounded-lg px-4 py-2.5 flex items-start gap-2">
              <ExclamationTriangleIcon className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <span className="text-xs text-red-300 flex-1">{generationError}</span>
              <button
                onClick={() => setGenerationError(null)}
                className="text-xs text-red-500 hover:text-red-300"
              >
                Dismiss
              </button>
            </div>
          )}
        </div>

        {/* ================================================================ */}
        {/* RIGHT PANEL - Control Center */}
        {/* ================================================================ */}
        <div className="w-[320px] flex-shrink-0 bg-neutral-900 border-l border-neutral-800 flex flex-col overflow-y-auto">
          {/* Prompt */}
          <div className="px-3 py-2 border-b border-neutral-800">
            <label className="text-[10px] font-medium text-neutral-400 uppercase tracking-wider mb-1 block">
              Prompt
            </label>
            <textarea
              value={prompt}
              onChange={(e) => {
                const val = e.target.value;
                setPrompt(val);
                if (val.trim()) {
                  setEvasionOutput(applyEvasion(val, evasionTechnique));
                } else {
                  setEvasionOutput(null);
                }
              }}
              placeholder="Describe the scene..."
              className="w-full h-[80px] bg-neutral-800 border border-neutral-700 rounded px-2 py-1.5 text-xs text-neutral-200 placeholder:text-neutral-600 resize-none focus:outline-none focus:border-neutral-600 transition-colors"
            />
          </div>

          {/* Evasion */}
          <div className="px-3 py-2 border-b border-neutral-800">
            <label className="text-[10px] font-medium text-neutral-400 uppercase tracking-wider mb-1 block">
              Evasion
            </label>
            <div className="space-y-1.5">
              <select
                value={evasionTechnique}
                onChange={(e) => {
                  const technique = e.target.value as EvasionTechnique;
                  setEvasionTechnique(technique);
                  if (prompt.trim()) {
                    setEvasionOutput(applyEvasion(prompt, technique));
                  }
                }}
                className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-[10px] text-neutral-300 focus:outline-none"
              >
                {TECHNIQUES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>

              {/* Char diff info */}
              {prompt.trim() && evasionOutput && (() => {
                const inLen = Array.from(prompt).length;
                const outLen = Array.from(evasionOutput).length;
                const diff = outLen - inLen;
                if (diff <= 0) return null;
                return (
                  <div className="text-[9px] text-neutral-500 flex items-center gap-1.5">
                    <span className="text-amber-500/80 font-medium">+{diff} chars</span>
                    <span>{inLen} → {outLen} chars</span>
                  </div>
                );
              })()}

              <textarea
                value={evasionOutput ?? ""}
                onChange={(e) => setEvasionOutput(e.target.value || null)}
                placeholder="Transformed output..."
                className="w-full h-[60px] text-[10px] px-2 py-1.5 border border-dashed border-neutral-600 rounded bg-neutral-900/30 text-neutral-300 resize-none focus:outline-none focus:ring-1 focus:ring-neutral-600 font-mono break-all"
              />
            </div>
          </div>

          {/* Controls */}
          <div className="px-3 py-2 border-b border-neutral-800">
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] font-medium text-neutral-400 uppercase tracking-wider">
                Controls
              </label>
              <button
                onClick={() => setCinematicEnabled(!cinematicEnabled)}
                className={`relative w-7 h-[16px] rounded-full transition-colors ${
                  cinematicEnabled ? "bg-blue-600" : "bg-neutral-700"
                }`}
              >
                <div
                  className={`absolute top-[2px] w-[12px] h-[12px] rounded-full bg-white transition-transform ${
                    cinematicEnabled ? "left-[13px]" : "left-[2px]"
                  }`}
                />
              </button>
            </div>
            {cinematicEnabled && (
              <div className="space-y-0.5">
                {CINEMATIC_GROUPS.map((group) => {
                  const isExpanded = expandedGroups.has(group.id);
                  // Compute active label for collapsed state
                  let activeLabel: string;
                  if (group.multiSelect) {
                    const activeIds = Array.from(cinematicState.scene);
                    const activeOptions = group.options.filter((o) => activeIds.includes(o.id));
                    activeLabel = activeOptions.length > 0
                      ? activeOptions.length <= 2
                        ? activeOptions.map((o) => o.label).join(", ")
                        : `${activeOptions.length} active`
                      : "none";
                  } else {
                    const key = group.id as keyof Omit<CinematicState, "scene">;
                    const activeId = cinematicState[key];
                    const activeOpt = activeId ? group.options.find((o) => o.id === activeId) : null;
                    activeLabel = activeOpt ? activeOpt.label : "none";
                  }

                  return (
                    <div key={group.id}>
                      <button
                        onClick={() => setExpandedGroups((prev) => {
                          const next = new Set(prev);
                          if (next.has(group.id)) next.delete(group.id);
                          else next.add(group.id);
                          return next;
                        })}
                        className="flex items-center gap-1 w-full py-0.5 text-left"
                      >
                        <ChevronRightIcon
                          className={`w-3 h-3 text-neutral-500 transition-transform ${
                            isExpanded ? "rotate-90" : ""
                          }`}
                        />
                        <span className="text-[10px] font-medium text-neutral-400">{group.label}</span>
                        <span className={`text-[9px] ml-auto ${activeLabel === "none" ? "text-neutral-600" : "text-neutral-400"}`}>
                          {activeLabel}
                        </span>
                      </button>
                      {isExpanded && (
                        <div className="flex flex-wrap gap-1 pl-4 pb-1 pt-0.5">
                          {group.options.map((opt) => {
                            let isActive: boolean;
                            if (group.multiSelect) {
                              isActive = cinematicState.scene.has(opt.id);
                            } else {
                              const key = group.id as keyof Omit<CinematicState, "scene">;
                              isActive = cinematicState[key] === opt.id;
                            }

                            return (
                              <button
                                key={opt.id}
                                title={opt.prompt}
                                onClick={() => {
                                  if (group.multiSelect) {
                                    setCinematicState((prev) => {
                                      const next = new Set(prev.scene);
                                      if (next.has(opt.id)) next.delete(opt.id);
                                      else next.add(opt.id);
                                      return { ...prev, scene: next };
                                    });
                                  } else {
                                    const key = group.id as keyof Omit<CinematicState, "scene">;
                                    setCinematicState((prev) => ({
                                      ...prev,
                                      [key]: prev[key] === opt.id ? null : opt.id,
                                    }));
                                  }
                                }}
                                className={`px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors ${
                                  isActive
                                    ? group.multiSelect
                                      ? "bg-green-600/30 text-green-400 border border-green-500/40"
                                      : "bg-blue-600/30 text-blue-400 border border-blue-500/40"
                                    : "bg-neutral-800 text-neutral-500 border border-neutral-700 hover:border-neutral-600 hover:text-neutral-400"
                                }`}
                              >
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Appearance reference toggle */}
          <div className="px-3 py-1.5 border-b border-neutral-800 flex items-center justify-between">
            <span className="text-[10px] text-neutral-400">Appearance reference (IN image)</span>
            <button
              onClick={() => setFaceReferenceEnabled(!faceReferenceEnabled)}
              className={`relative w-7 h-[16px] rounded-full transition-colors ${
                faceReferenceEnabled ? "bg-blue-600" : "bg-neutral-700"
              }`}
            >
              <div
                className={`absolute top-[2px] w-[12px] h-[12px] rounded-full bg-white transition-transform ${
                  faceReferenceEnabled ? "left-[13px]" : "left-[2px]"
                }`}
              />
            </button>
          </div>

          {/* Parameters */}
          <div className="px-3 py-2 border-b border-neutral-800 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-neutral-500 w-12 shrink-0">Duration</span>
              <input
                type="range"
                min={1}
                max={15}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="flex-1 h-1 bg-neutral-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500"
              />
              <span className="text-[10px] text-neutral-300 font-medium tabular-nums w-6 text-right">{duration}s</span>
            </div>

            <div className="flex gap-1.5">
              <div className="flex-1">
                <span className="text-[9px] text-neutral-500 mb-0.5 block">Ratio</span>
                <div className="flex gap-0.5">
                  {["9:16", "16:9", "1:1"].map((ar) => (
                    <button
                      key={ar}
                      onClick={() => setAspectRatio(ar)}
                      className={`flex-1 py-1 rounded text-[9px] font-medium transition-colors ${
                        aspectRatio === ar
                          ? "bg-blue-600/30 text-blue-400 border border-blue-500/40"
                          : "bg-neutral-800 text-neutral-500 border border-neutral-700 hover:border-neutral-600"
                      }`}
                    >
                      {ar}
                    </button>
                  ))}
                </div>
              </div>
              <div className="w-[90px] shrink-0">
                <span className="text-[9px] text-neutral-500 mb-0.5 block">Res</span>
                <div className="flex gap-0.5">
                  {["480p", "720p"].map((res) => (
                    <button
                      key={res}
                      onClick={() => setResolution(res)}
                      className={`flex-1 py-1 rounded text-[9px] font-medium transition-colors ${
                        resolution === res
                          ? "bg-blue-600/30 text-blue-400 border border-blue-500/40"
                          : "bg-neutral-800 text-neutral-500 border border-neutral-700 hover:border-neutral-600"
                      }`}
                    >
                      {res}
                    </button>
                  ))}
                </div>
              </div>
            </div>

          </div>

          {/* Generate / Regenerate */}
          <div className="px-3 py-2 mt-auto">
            <button
              onClick={() => {
                if (isGenerating) {
                  generateAbortRef.current?.abort();
                } else {
                  handleGenerate();
                }
              }}
              className={`w-full py-2 rounded text-xs font-medium text-white flex items-center justify-center gap-1.5 transition-colors ${
                isGenerating
                  ? "bg-red-600 hover:bg-red-500"
                  : activeClip && activeClip.status !== "generating"
                    ? "bg-amber-600 hover:bg-amber-500"
                    : "bg-blue-600 hover:bg-blue-500"
              }`}
            >
              {isGenerating ? (
                <>
                  <XMarkIcon className="w-4 h-4" />
                  Cancel
                </>
              ) : activeClip && activeClip.status !== "generating" ? (
                <>
                  <ArrowPathIcon className="w-3.5 h-3.5" />
                  Regenerate
                </>
              ) : (
                <>
                  <PlayIconSolid className="w-4 h-4" />
                  Generate
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ================================================================== */}
      {/* TIMELINE */}
      {/* ================================================================== */}
      <div className="h-[200px] flex-shrink-0 bg-neutral-900 border-t border-neutral-800 flex flex-col relative overflow-visible">
        {/* Playback controls row */}
        <div className="h-[30px] flex items-center px-3 border-b border-neutral-800/50 gap-3">
          <button
            onClick={togglePlayback}
            disabled={playableClips.length === 0}
            className="text-neutral-400 hover:text-neutral-200 disabled:text-neutral-700 transition-colors"
          >
            {isPlaying ? (
              <PauseIcon className="w-3.5 h-3.5" />
            ) : (
              <PlayIcon className="w-3.5 h-3.5" />
            )}
          </button>
          <span className="text-[10px] text-neutral-500 tabular-nums">
            {Math.floor(globalTime / 60)}:
            {String(Math.floor(globalTime % 60)).padStart(2, "0")}
            {" / "}
            {Math.floor(totalDuration / 60)}:
            {String(totalDuration % 60).padStart(2, "0")}
          </span>
          <button
            onClick={() => {
              setIsLooping((prev) => {
                isLoopingRef.current = !prev;
                return !prev;
              });
            }}
            className={`transition-colors ${
              isLooping
                ? "text-blue-400 hover:text-blue-300"
                : "text-neutral-600 hover:text-neutral-400"
            }`}
            title={isLooping ? "Loop: ON" : "Loop: OFF"}
          >
            <ArrowPathIcon className="w-3.5 h-3.5" />
          </button>
          <div className="flex-1" />
          <button
            onClick={handleExport}
            disabled={playableClips.length === 0 || isExporting}
            className="flex items-center gap-1 px-2 py-0.5 text-[10px] text-neutral-400 hover:text-neutral-200 disabled:text-neutral-700 bg-neutral-800 hover:bg-neutral-750 disabled:bg-transparent rounded border border-neutral-700 disabled:border-neutral-800 transition-colors"
          >
            <ArrowDownTrayIcon className="w-3 h-3" />
            {isExporting ? "Exporting..." : "Export"}
          </button>
        </div>

        {/* Scrubber / seeker bar */}
        <div
          ref={timelineTrackRef}
          className="h-[24px] mx-3 relative cursor-pointer select-none"
          onMouseDown={handleScrubStart}
        >
          {totalDuration > 0 && (
            <>
              {/* Track background */}
              <div className="absolute top-[10px] left-0 right-0 h-[4px] bg-neutral-800 rounded-full" />
              {/* Clip boundary markers */}
              {(() => {
                let acc = 0;
                return playableClips.slice(0, -1).map((c) => {
                  acc += c.duration;
                  const pct = (acc / totalDuration) * 100;
                  return (
                    <div
                      key={`boundary-${c.id}`}
                      className="absolute top-[6px] w-[2px] h-[12px] bg-neutral-600 z-[5] pointer-events-none rounded-full"
                      style={{ left: `${pct}%` }}
                    />
                  );
                });
              })()}
              {/* Progress fill */}
              <div
                className="absolute top-[10px] left-0 h-[4px] bg-blue-600/50 rounded-full"
                style={{ width: `${(globalTime / totalDuration) * 100}%` }}
              />
              {/* Playhead */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-blue-500 z-10 pointer-events-none"
                style={{ left: `${(globalTime / totalDuration) * 100}%` }}
              >
                <div className="absolute top-[6px] left-1/2 -translate-x-1/2 w-3 h-3 bg-blue-500 rounded-full shadow-lg shadow-blue-500/30" />
              </div>
              {/* Time labels */}
              <div className="absolute top-[16px] left-0 right-0 flex">
                {Array.from({ length: Math.ceil(totalDuration) + 1 }).map(
                  (_, i) => (
                    <div
                      key={i}
                      className="flex-shrink-0"
                      style={{ width: `${(1 / totalDuration) * 100}%` }}
                    >
                      {i % 5 === 0 && (
                        <span className="text-[7px] text-neutral-600 tabular-nums">
                          {i}s
                        </span>
                      )}
                    </div>
                  )
                )}
              </div>
            </>
          )}
        </div>

        {/* Clip track */}
        <div className="flex-1 px-3 py-2 overflow-x-auto overflow-y-visible flex items-center gap-1.5">
          {/* Input image as first timeline item — always shows original upload */}
          {(originalInputImage || inputImage) && (
            <div className="flex-shrink-0 h-[70px] relative group/inimg">
              <button
                onClick={() => {
                  stopPlayback();
                  setActiveClipId(null);
                  setPreviewImage(originalInputImage || inputImage || null);
                }}
                className={`flex-shrink-0 h-[70px] rounded-md overflow-hidden border-2 transition-colors relative cursor-pointer ${
                  previewImage === (originalInputImage || inputImage) ? "border-green-500" : "border-neutral-700 hover:border-neutral-600"
                }`}
                style={{ aspectRatio: "9/16" }}
                title="Preview original input image"
              >
                <img
                  src={originalInputImage || inputImage!}
                  alt="Input"
                  className="w-full h-full object-cover"
                />
                <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-1 py-0.5">
                  <span className="text-[8px] text-green-400 font-medium">IN</span>
                </div>
              </button>
              {/* Camera button overlay — generate angle variant from IN image */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const rect = e.currentTarget.getBoundingClientRect();
                  setAnglePickerClipId("__input__");
                  setAnglePickerPos({ x: rect.left, y: rect.top });
                  setAnglePickerSourceImage(originalInputImage || inputImage || null);
                }}
                className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center text-neutral-400 hover:text-violet-400 hover:bg-violet-600/60 transition-all opacity-0 group-hover/inimg:opacity-100 z-10"
                title="Generate angle variant from input image"
              >
                <CameraIcon className="w-3 h-3" />
              </button>
              {/* "Use as next input" button — bottom left */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveClipId(null);
                  setInputImage(originalInputImage || inputImage);
                  setInputImagePath(originalInputImagePath || inputImagePath);
                }}
                className="absolute bottom-0.5 left-0.5 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center text-neutral-400 hover:text-green-400 hover:bg-green-600/60 transition-all opacity-0 group-hover/inimg:opacity-100 z-10"
                title="Use as next input"
              >
                <ArrowRightIcon className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Angle variants generated from IN image */}
          {inputAngleVariants.length > 0 && (
            <div className="flex-shrink-0 flex items-center gap-1.5">
              {inputAngleVariants.map((variant) => (
                <div key={variant.id} className="flex-shrink-0 h-[70px]">
                  {variant.status === "generating" ? (
                    <div className="h-[70px] rounded-md border-2 border-violet-500/40 bg-neutral-800 flex items-center justify-center" style={{ aspectRatio: "9/16" }}>
                      <div className="w-4 h-4 border-2 border-neutral-600 border-t-violet-500 rounded-full animate-spin" />
                    </div>
                  ) : variant.status === "error" ? (
                    <div
                      className="h-[70px] rounded-md border-2 border-red-500/40 bg-red-950/20 flex items-center justify-center cursor-pointer"
                      style={{ aspectRatio: "9/16" }}
                      title={variant.error || "Generation failed"}
                      onClick={() => setInputAngleVariants((prev) => prev.filter((av) => av.id !== variant.id))}
                    >
                      <ExclamationTriangleIcon className="w-4 h-4 text-red-500/70" />
                    </div>
                  ) : variant.image ? (
                    <div className="relative group/variant">
                      <button
                        onClick={() => {
                          setActiveClipId(null);
                          setPreviewImage(variant.image);
                        }}
                        className="flex-shrink-0 h-[70px] rounded-md overflow-hidden border-2 border-violet-500/40 hover:border-violet-400 relative transition-colors cursor-pointer"
                        style={{ aspectRatio: "9/16" }}
                        title={`Preview ${ANGLE_PRESETS.find((p) => p.id === variant.presetId)?.label ?? variant.presetId}`}
                      >
                        <img src={variant.image} alt={variant.presetId} className="w-full h-full object-cover" />
                        <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-1 py-0.5">
                          <span className="text-[7px] text-violet-400 font-medium">
                            {ANGLE_PRESETS.find((p) => p.id === variant.presetId)?.label ?? ""}
                          </span>
                        </div>
                      </button>
                      {/* Camera button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const rect = e.currentTarget.getBoundingClientRect();
                          setAnglePickerClipId("__input__");
                          setAnglePickerPos({ x: rect.left, y: rect.top });
                          setAnglePickerSourceImage(variant.image);
                        }}
                        className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center text-neutral-400 hover:text-violet-400 hover:bg-violet-600/60 transition-all opacity-0 group-hover/variant:opacity-100 z-10"
                        title="Generate another angle from this variant"
                      >
                        <CameraIcon className="w-3 h-3" />
                      </button>
                      {/* Use as next input */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveClipId(null);
                          setInputImage(variant.image);
                          if (variant.imagePath) setInputImagePath(variant.imagePath);
                        }}
                        className="absolute bottom-0.5 left-0.5 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center text-neutral-400 hover:text-green-400 hover:bg-green-600/60 transition-all opacity-0 group-hover/variant:opacity-100 z-10"
                        title="Use as next input"
                      >
                        <ArrowRightIcon className="w-3 h-3" />
                      </button>
                      {/* Delete */}
                      <div
                        className="absolute -top-1 -right-1 opacity-0 group-hover/variant:opacity-100 transition-opacity cursor-pointer z-10"
                        onClick={() => setInputAngleVariants((prev) => prev.filter((av) => av.id !== variant.id))}
                      >
                        <div className="w-4 h-4 bg-black/80 rounded-full flex items-center justify-center hover:bg-red-600 transition-colors">
                          <XMarkIcon className="w-2.5 h-2.5 text-white" />
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}

          {clips.length === 0 && !inputImage ? (
            <div className="flex-1 flex items-center justify-center h-[70px]">
              <span className="text-[10px] text-neutral-600">
                Timeline empty — upload image & generate
              </span>
            </div>
          ) : (
            <>
              {clips.map((clip, index) => (
                <div
                  key={clip.id}
                  className="flex-shrink-0 flex items-center gap-1.5"
                >
                  {/* Video clip — width proportional to duration */}
                  <button
                    onClick={() => handleClipClick(clip.id)}
                    className={`flex-shrink-0 h-[70px] rounded-md overflow-hidden border-2 transition-colors relative group ${
                      activeClipId === clip.id
                        ? "border-blue-500"
                        : clip.status === "error"
                          ? "border-red-500/50"
                          : "border-neutral-700 hover:border-neutral-600"
                    }`}
                    style={{ width: `${Math.max(40, clip.duration * 30)}px` }}
                  >
                    {clip.status === "generating" ? (
                      <div className="w-full h-full bg-neutral-800 flex items-center justify-center">
                        <div className="w-4 h-4 border-2 border-neutral-600 border-t-blue-500 rounded-full animate-spin" />
                      </div>
                    ) : clip.status === "error" ? (
                      <div className="w-full h-full bg-red-950/30 flex items-center justify-center">
                        <ExclamationTriangleIcon className="w-4 h-4 text-red-500/70" />
                      </div>
                    ) : clip.thumbnail ? (
                      <img
                        src={clip.thumbnail}
                        alt={`Clip ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-neutral-800 flex items-center justify-center">
                        <span className="text-[8px] text-neutral-600">
                          {index + 1}
                        </span>
                      </div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-1 py-0.5">
                      <span className="text-[8px] text-neutral-300 tabular-nums">
                        {clip.duration}s
                      </span>
                    </div>
                    {/* Delete button */}
                    <div
                      className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteClip(clip.id);
                      }}
                    >
                      <div className="w-4 h-4 bg-black/80 rounded-full flex items-center justify-center hover:bg-red-600 transition-colors">
                        <XMarkIcon className="w-2.5 h-2.5 text-white" />
                      </div>
                    </div>
                  </button>

                  {/* Last frame + angle variants (all same size, horizontal) */}
                  {clip.lastFrame && clip.status === "done" && (
                    <div className="flex-shrink-0 flex items-center gap-1.5">
                      <div className="text-neutral-600 text-[10px]">&rarr;</div>
                      {/* Frame thumbnail with camera button overlay */}
                      <div className="flex-shrink-0 h-[70px] relative group/frame">
                        <button
                          onClick={() => {
                            setActiveClipId(null);
                            setPreviewImage(clip.lastFrame);
                          }}
                          className="flex-shrink-0 h-[70px] rounded-md overflow-hidden border-2 border-orange-500/40 hover:border-orange-400 relative transition-colors cursor-pointer"
                          style={{ aspectRatio: "9/16" }}
                          title="Preview this frame"
                        >
                          <img
                            src={clip.lastFrame}
                            alt={`Frame ${index + 1}`}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-1 py-0.5">
                            <span className="text-[8px] text-orange-400 font-medium">F{index + 1}</span>
                          </div>
                        </button>
                        {/* Camera button overlay */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const rect = e.currentTarget.getBoundingClientRect();
                            setAnglePickerClipId(clip.id);
                            setAnglePickerPos({ x: rect.left, y: rect.top });
                            setAnglePickerSourceImage(clip.lastFrame);
                          }}
                          className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center text-neutral-400 hover:text-violet-400 hover:bg-violet-600/60 transition-all opacity-0 group-hover/frame:opacity-100 z-10"
                          title="Generate angle variant from this frame"
                        >
                          <CameraIcon className="w-3 h-3" />
                        </button>
                        {/* "Use as next input" button — bottom left */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveClipId(null);
                            setInputImage(clip.lastFrame);
                            if (clip.lastFramePath) setInputImagePath(clip.lastFramePath);
                          }}
                          className="absolute bottom-0.5 left-0.5 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center text-neutral-400 hover:text-green-400 hover:bg-green-600/60 transition-all opacity-0 group-hover/frame:opacity-100 z-10"
                          title="Use as next input"
                        >
                          <ArrowRightIcon className="w-3 h-3" />
                        </button>
                      </div>

                      {/* Variant thumbnails — same size as frame */}
                      {clip.angleVariants.map((variant) => (
                        <div key={variant.id} className="flex-shrink-0 h-[70px]">
                          {variant.status === "generating" ? (
                            <div className="h-[70px] rounded-md border-2 border-violet-500/40 bg-neutral-800 flex items-center justify-center" style={{ aspectRatio: "9/16" }}>
                              <div className="w-4 h-4 border-2 border-neutral-600 border-t-violet-500 rounded-full animate-spin" />
                            </div>
                          ) : variant.status === "error" ? (
                            <div
                              className="h-[70px] rounded-md border-2 border-red-500/40 bg-red-950/20 flex items-center justify-center cursor-pointer"
                              style={{ aspectRatio: "9/16" }}
                              title={variant.error || "Generation failed"}
                              onClick={() => {
                                setClips((prev) =>
                                  prev.map((c) =>
                                    c.id === clip.id
                                      ? { ...c, angleVariants: c.angleVariants.filter((av) => av.id !== variant.id) }
                                      : c
                                  )
                                );
                              }}
                            >
                              <ExclamationTriangleIcon className="w-4 h-4 text-red-500/70" />
                            </div>
                          ) : variant.image ? (
                            <div className="relative group/variant">
                              <button
                                onClick={() => {
                                  setActiveClipId(null);
                                  setPreviewImage(variant.image);
                                }}
                                className="flex-shrink-0 h-[70px] rounded-md overflow-hidden border-2 border-violet-500/40 hover:border-violet-400 relative transition-colors cursor-pointer"
                                style={{ aspectRatio: "9/16" }}
                                title={`Preview ${ANGLE_PRESETS.find((p) => p.id === variant.presetId)?.label ?? variant.presetId}`}
                              >
                                <img
                                  src={variant.image}
                                  alt={variant.presetId}
                                  className="w-full h-full object-cover"
                                />
                                <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-1 py-0.5">
                                  <span className="text-[7px] text-violet-400 font-medium">
                                    {ANGLE_PRESETS.find((p) => p.id === variant.presetId)?.label ?? ""}
                                  </span>
                                </div>
                              </button>
                              {/* Camera button overlay — top left */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  setAnglePickerClipId(clip.id);
                                  setAnglePickerPos({ x: rect.left, y: rect.top });
                                  setAnglePickerSourceImage(variant.image);
                                }}
                                className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center text-neutral-400 hover:text-violet-400 hover:bg-violet-600/60 transition-all opacity-0 group-hover/variant:opacity-100 z-10"
                                title="Generate another angle from this variant"
                              >
                                <CameraIcon className="w-3 h-3" />
                              </button>
                              {/* "Use as next input" button — bottom left */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveClipId(null);
                                  setInputImage(variant.image);
                                  if (variant.imagePath) setInputImagePath(variant.imagePath);
                                }}
                                className="absolute bottom-0.5 left-0.5 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center text-neutral-400 hover:text-green-400 hover:bg-green-600/60 transition-all opacity-0 group-hover/variant:opacity-100 z-10"
                                title="Use as next input"
                              >
                                <ArrowRightIcon className="w-3 h-3" />
                              </button>
                              {/* Delete button — top right */}
                              <button
                                className="absolute -top-1 -right-1 opacity-0 group-hover/variant:opacity-100 transition-opacity cursor-pointer z-10"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setClips((prev) =>
                                    prev.map((c) =>
                                      c.id === clip.id
                                        ? { ...c, angleVariants: c.angleVariants.filter((av) => av.id !== variant.id) }
                                        : c
                                    )
                                  );
                                }}
                              >
                                <div className="w-4 h-4 bg-black/80 rounded-full flex items-center justify-center hover:bg-red-600 transition-colors">
                                  <XMarkIcon className="w-2.5 h-2.5 text-white" />
                                </div>
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {/* "Next input" image at end of timeline — shown when user selected a variant/frame as next input */}
              {clips.length > 0 && inputImage && inputImage !== (originalInputImage || "") && (
                <div
                  className="flex-shrink-0 flex items-center gap-1.5"
                >
                  <div className="text-green-500 text-[10px]">&rarr;</div>
                  <div
                    className="flex-shrink-0 h-[70px] rounded-md overflow-hidden border-2 border-green-500/60 relative"
                    style={{ aspectRatio: "9/16" }}
                  >
                    <img
                      src={inputImage}
                      alt="Next input"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-1 py-0.5">
                      <span className="text-[8px] text-green-400 font-medium">NEXT</span>
                    </div>
                    {/* Remove button — always visible inside thumbnail */}
                    <button
                      className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/70 flex items-center justify-center hover:bg-red-600 transition-colors z-10"
                      onClick={() => {
                        const lastClip = clips[clips.length - 1];
                        if (lastClip?.lastFrame) {
                          setInputImage(lastClip.lastFrame);
                          if (lastClip.lastFramePath) setInputImagePath(lastClip.lastFramePath);
                        }
                      }}
                      title="Remove — revert to last frame"
                    >
                      <XMarkIcon className="w-3 h-3 text-white" />
                    </button>
                  </div>
                </div>
              )}

              {/* Drop zone at end of timeline */}
              <div
                className={`flex-shrink-0 h-[70px] rounded-md border-2 border-dashed flex items-center justify-center transition-all ${
                  isDraggingToTimeline
                    ? "w-[60px] border-green-500/60 bg-green-500/10"
                    : "w-2 border-transparent"
                }`}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "copy";
                }}
                onDragEnter={(e) => {
                  e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const imageData = e.dataTransfer.getData("text/plain");
                  const imagePath = e.dataTransfer.getData("application/x-imagepath");
                  if (imageData) {
                    setActiveClipId(null);
                    setInputImage(imageData);
                    if (imagePath) setInputImagePath(imagePath);
                  }
                  setIsDraggingToTimeline(false);
                }}
              >
                {isDraggingToTimeline && (
                  <span className="text-[8px] text-green-400 font-medium text-center leading-tight">
                    Drop<br />here
                  </span>
                )}
              </div>
            </>
          )}
        </div>

        {/* Bottom spacer */}
        <div className="h-1" />
      </div>

      {/* Angle picker dropdown — fixed position to escape overflow clipping */}
      {anglePickerClipId && anglePickerPos && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => { setAnglePickerClipId(null); setAnglePickerPos(null); setAnglePickerSourceImage(null); setAngleSubmenu(null); setShowCustomAngleInput(false); setCustomAnglePrompt(""); }} />
          <div
            className="fixed z-[70] bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl p-1.5 min-w-[180px] max-h-[70vh] overflow-y-auto"
            style={{ left: anglePickerPos.x, bottom: window.innerHeight - anglePickerPos.y + 4 }}
          >
            {/* All groups as fly-out submenus */}
            {(() => {
              const allGroups = ["Enhance", "Framing", "Angle", "Orbit Camera", "Orbit Person"];
              return allGroups.map((group, gi) => {
                const presets = ANGLE_PRESETS.filter((p) => (p as { group?: string }).group === group);
                if (presets.length === 0) return null;
                return (
                  <div key={group}>
                    {gi > 0 && <div className="border-t border-neutral-700 my-1" />}
                    <button
                      onMouseEnter={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setAngleSubmenu(group);
                        setAngleSubmenuPos({ x: rect.right + 4, y: rect.top });
                      }}
                      onClick={(e) => {
                        if (angleSubmenu === group) {
                          setAngleSubmenu(null);
                        } else {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setAngleSubmenu(group);
                          setAngleSubmenuPos({ x: rect.right + 4, y: rect.top });
                        }
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded text-left transition-colors ${
                        angleSubmenu === group ? "bg-neutral-700" : "hover:bg-neutral-700"
                      }`}
                    >
                      <span className="text-[11px] text-neutral-300 font-medium">{group}</span>
                      <ArrowRightIcon className="w-3 h-3 text-neutral-500" />
                    </button>
                  </div>
                );
              });
            })()}
            {/* Custom prompt option */}
            <div className="border-t border-neutral-700 my-1" />
            {!showCustomAngleInput ? (
              <button
                onClick={() => setShowCustomAngleInput(true)}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-left hover:bg-neutral-700 transition-colors"
              >
                <PlusIcon className="w-3.5 h-3.5 text-neutral-400" />
                <span className="text-[11px] text-neutral-300 font-medium">Custom</span>
              </button>
            ) : (
              <div className="px-2 py-1.5">
                <textarea
                  autoFocus
                  value={customAnglePrompt}
                  onChange={(e) => setCustomAnglePrompt(e.target.value)}
                  placeholder="Describe the angle/change..."
                  className="w-full h-[50px] text-[10px] px-2 py-1.5 border border-neutral-600 rounded bg-neutral-900 text-neutral-300 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-neutral-600"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && customAnglePrompt.trim()) {
                      e.preventDefault();
                      handleGenerateAngle(anglePickerClipId!, "custom", anglePickerSourceImage ?? undefined, customAnglePrompt.trim());
                    }
                    if (e.key === "Escape") {
                      setShowCustomAngleInput(false);
                      setCustomAnglePrompt("");
                    }
                  }}
                />
                <div className="flex gap-1 mt-1">
                  <button
                    onClick={() => {
                      if (customAnglePrompt.trim()) {
                        handleGenerateAngle(anglePickerClipId!, "custom", anglePickerSourceImage ?? undefined, customAnglePrompt.trim());
                      }
                    }}
                    disabled={!customAnglePrompt.trim()}
                    className="flex-1 py-1 rounded text-[9px] font-medium bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Generate
                  </button>
                  <button
                    onClick={() => { setShowCustomAngleInput(false); setCustomAnglePrompt(""); }}
                    className="px-2 py-1 rounded text-[9px] text-neutral-400 hover:text-neutral-300 hover:bg-neutral-700 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
          {/* Submenu — also fixed position, anchored to bottom of trigger so it opens upward */}
          {angleSubmenu && angleSubmenuPos && (
            <div
              className="fixed z-[80] bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl p-1.5 min-w-[180px]"
              style={{ left: angleSubmenuPos.x, bottom: window.innerHeight - angleSubmenuPos.y - 32 }}
              onMouseLeave={() => setAngleSubmenu(null)}
            >
              {ANGLE_PRESETS.filter((p) => (p as { group?: string }).group === angleSubmenu).map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => handleGenerateAngle(anglePickerClipId!, preset.id, anglePickerSourceImage ?? undefined)}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-left hover:bg-neutral-700 transition-colors"
                  title={preset.prompt}
                >
                  {(() => { const Icon = ANGLE_ICONS[preset.id]; return Icon ? <Icon className="w-3.5 h-3.5 text-neutral-400" /> : null; })()}
                  <span className="text-[11px] text-neutral-300">{preset.label}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
