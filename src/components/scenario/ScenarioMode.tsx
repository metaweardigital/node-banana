"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  ArrowLeftIcon,
  ArrowUpTrayIcon,
  PlayIcon,
  PauseIcon,
  PlusIcon,
  ChevronRightIcon,
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { PlayIcon as PlayIconSolid } from "@heroicons/react/24/solid";
import {
  getProviderSettings,
} from "@/store/utils/localStorage";

// ============================================================================
// Types
// ============================================================================

interface Clip {
  id: string;
  thumbnail: string | null;       // runtime: display URL for timeline
  thumbnailPath: string | null;    // persisted: relative path on disk
  videoSrc: string | null;         // runtime: blob URL or API URL for playback
  videoPath: string | null;        // persisted: relative path on disk
  duration: number;
  prompt: string;
  status: "idle" | "generating" | "done" | "error";
  error?: string;
}

type EvasionTechnique = "none" | "context-framing" | "role-play" | "metaphor";

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "cs", label: "Čeština" },
  { code: "es", label: "Español" },
  { code: "de", label: "Deutsch" },
  { code: "fr", label: "Français" },
  { code: "ja", label: "日本語" },
  { code: "ko", label: "한국어" },
  { code: "ar", label: "العربية" },
  { code: "zh", label: "中文" },
  { code: "ru", label: "Русский" },
];

const STYLE_TAGS = [
  "cinematic",
  "slow motion",
  "dramatic lighting",
  "aerial shot",
  "close-up",
  "timelapse",
  "handheld",
  "golden hour",
  "noir",
  "neon",
];

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
  prompt: string;
  evasionEnabled: boolean;
  evasionTechnique: EvasionTechnique;
  language: string;
  negativePrompt: string;
  activeTags: string[];
  duration: number;
  aspectRatio: string;
  resolution: string;
  useLastFrame: boolean;
  clips: Array<{
    id: string;
    thumbnailPath: string | null;
    videoPath: string | null;
    duration: number;
    prompt: string;
    status: "idle" | "generating" | "done" | "error";
  }>;
  activeClipId: string | null;
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
  prompt: string;
  evasionEnabled: boolean;
  evasionTechnique: EvasionTechnique;
  language: string;
  negativePrompt: string;
  activeTags: string[];
  duration: number;
  aspectRatio: string;
  resolution: string;
  useLastFrame: boolean;
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

    const clips: Clip[] = (disk.clips ?? []).map((c) => ({
      id: c.id,
      thumbnail: resolveImagePath(c.thumbnailPath, directoryPath),
      thumbnailPath: c.thumbnailPath ?? null,
      videoSrc: resolveImagePath(c.videoPath, directoryPath),
      videoPath: c.videoPath ?? null,
      duration: c.duration,
      prompt: c.prompt,
      status: c.status === "generating" ? "done" : c.status, // reset stuck generating state
    }));

    return {
      inputImage,
      inputImagePath,
      prompt: disk.prompt ?? "",
      evasionEnabled: disk.evasionEnabled ?? false,
      evasionTechnique: disk.evasionTechnique ?? "context-framing",
      language: disk.language ?? "en",
      negativePrompt: disk.negativePrompt ?? "",
      activeTags: disk.activeTags ?? [],
      duration: disk.duration ?? 12,
      aspectRatio: disk.aspectRatio ?? "9:16",
      resolution: disk.resolution ?? "480p",
      useLastFrame: disk.useLastFrame ?? true,
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
    prompt: string;
    evasionEnabled: boolean;
    evasionTechnique: EvasionTechnique;
    language: string;
    negativePrompt: string;
    activeTags: string[];
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
      prompt: state.prompt,
      evasionEnabled: state.evasionEnabled,
      evasionTechnique: state.evasionTechnique,
      language: state.language,
      negativePrompt: state.negativePrompt,
      activeTags: state.activeTags,
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
          duration: c.duration,
          prompt: c.prompt,
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

function extractLastFrame(videoSrc: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.preload = "auto";
    video.muted = true;

    video.onloadedmetadata = () => {
      // Seek to near end (last 0.1s)
      video.currentTime = Math.max(0, video.duration - 0.1);
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Could not get canvas context"));
          return;
        }
        ctx.drawImage(video, 0, 0);
        const dataUrl = canvas.toDataURL("image/png");
        resolve(dataUrl);
      } catch (err) {
        reject(err);
      } finally {
        video.src = "";
        video.load();
      }
    };

    video.onerror = () => {
      reject(new Error("Failed to load video for frame extraction"));
    };

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
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Prompt & evasion
  const [prompt, setPrompt] = useState("");
  const [evasionEnabled, setEvasionEnabled] = useState(false);
  const [evasionTechnique, setEvasionTechnique] =
    useState<EvasionTechnique>("context-framing");
  const [language, setLanguage] = useState("en");
  const [negativePromptOpen, setNegativePromptOpen] = useState(false);
  const [negativePrompt, setNegativePrompt] = useState("");
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());

  // Parameters
  const [duration, setDuration] = useState(12);
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [resolution, setResolution] = useState("480p");

  // Use last frame
  const [useLastFrame, setUseLastFrame] = useState(true);

  // Timeline
  const [clips, setClips] = useState<Clip[]>([]);
  const [activeClipId, setActiveClipId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [globalTime, setGlobalTime] = useState(0); // current playback position across all clips (seconds)
  const isPlayingRef = useRef(false); // ref mirror to avoid stale closures in rAF
  const rafRef = useRef<number | null>(null);

  // Generating state
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

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
        setPrompt(saved.prompt ?? "");
        setEvasionEnabled(saved.evasionEnabled ?? false);
        setEvasionTechnique(saved.evasionTechnique ?? "context-framing");
        setLanguage(saved.language ?? "en");
        setNegativePrompt(saved.negativePrompt ?? "");
        setActiveTags(new Set(saved.activeTags ?? []));
        setDuration(saved.duration ?? 12);
        setAspectRatio(saved.aspectRatio ?? "9:16");
        setResolution(saved.resolution ?? "480p");
        setUseLastFrame(saved.useLastFrame ?? true);
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
    setPrompt("");
    setEvasionEnabled(false);
    setEvasionTechnique("context-framing");
    setLanguage("en");
    setNegativePrompt("");
    setActiveTags(new Set());
    setDuration(12);
    setAspectRatio("9:16");
    setResolution("480p");
    setUseLastFrame(true);
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
      prompt,
      evasionEnabled,
      evasionTechnique,
      language,
      negativePrompt,
      activeTags: Array.from(activeTags),
      duration,
      aspectRatio,
      resolution,
      useLastFrame,
      clips,
      activeClipId,
    });
  }, [isLoaded, activeProject, inputImagePath, prompt, evasionEnabled, evasionTechnique, language, negativePrompt, activeTags, duration, aspectRatio, resolution, useLastFrame, clips, activeClipId]);

  // ---- Handlers ----

  const handleNewScenario = useCallback(() => {
    setActiveProject(null);
    setIsLoaded(false);
    setShowProjectPicker(true);
    localStorage.removeItem("node-banana-scenario-active");
    resetState();
  }, [resetState]);

  // Save uploaded image to project inputs/ folder on disk
  const saveInputImage = useCallback(async (dataUrl: string) => {
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
        setInputImage(imageUrl(result.filePath));
      } else {
        setInputImage(dataUrl);
        setInputImagePath(null);
      }
    } catch {
      setInputImage(dataUrl);
      setInputImagePath(null);
    }
  }, [activeProject]);

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

  const handleToggleTag = useCallback((tag: string) => {
    setActiveTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }, []);

  // Build the full prompt with style tags appended
  const buildFullPrompt = useCallback(() => {
    let fullPrompt = prompt;
    if (activeTags.size > 0) {
      fullPrompt += ". " + Array.from(activeTags).join(", ");
    }
    if (negativePrompt.trim()) {
      fullPrompt += `. Avoid: ${negativePrompt.trim()}`;
    }
    return fullPrompt;
  }, [prompt, activeTags, negativePrompt]);

  // Real xAI video generation
  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) {
      setGenerationError("Prompt is required");
      return;
    }

    setIsGenerating(true);
    setGenerationError(null);

    const clipId = `clip-${Date.now()}`;
    const fullPrompt = buildFullPrompt();

    // Create placeholder clip
    const placeholderClip: Clip = {
      id: clipId,
      thumbnail: null,
      thumbnailPath: null,
      videoSrc: null,
      videoPath: null,
      duration,
      prompt: fullPrompt,
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

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (xaiApiKey) headers["X-XAI-Key"] = xaiApiKey;

      const response = await fetch("/api/generate", {
        method: "POST",
        headers,
        body: JSON.stringify({
          prompt: fullPrompt,
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

        // Extract and save thumbnail (first frame or last frame)
        try {
          const frameDataUrl = await extractLastFrame(videoSrc);
          const thumbDir = `${activeProject.directoryPath}/thumbnails`;
          const thumbId = `thumb_${Date.now()}`;
          const thumbRes = await fetch("/api/save-generation", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              directoryPath: thumbDir,
              image: frameDataUrl,
              prompt: "thumbnail",
              customFilename: thumbId,
              createDirectory: true,
            }),
          });
          const thumbResult = await thumbRes.json();
          if (thumbResult.success && thumbResult.filePath) {
            thumbnailPath = `thumbnails/${thumbResult.filename}`;
            thumbnailUrl = imageUrl(thumbResult.filePath);
          }

          // If "use last frame" is enabled, set as next input
          if (useLastFrame) {
            const inputDir = `${activeProject.directoryPath}/inputs`;
            const frameId = `lastframe_${Date.now()}`;
            const frameRes = await fetch("/api/save-generation", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                directoryPath: inputDir,
                image: frameDataUrl,
                prompt: "last-frame",
                customFilename: frameId,
                createDirectory: true,
              }),
            });
            const frameResult = await frameRes.json();
            if (frameResult.success && frameResult.filePath) {
              setInputImagePath(`inputs/${frameResult.filename}`);
              setInputImage(imageUrl(frameResult.filePath));
            }
          }
        } catch {
          // Frame extraction failed — use input image as thumbnail fallback
          thumbnailUrl = inputImage;
          thumbnailPath = inputImagePath;
        }
      }

      // Update clip with real data
      setClips((prev) =>
        prev.map((c) =>
          c.id === clipId
            ? {
                ...c,
                videoSrc,
                videoPath,
                thumbnail: thumbnailUrl || inputImage,
                thumbnailPath: thumbnailPath || inputImagePath,
                status: "done" as const,
              }
            : c
        )
      );
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Generation failed";
      setGenerationError(errorMsg);
      // Update clip with error
      setClips((prev) =>
        prev.map((c) =>
          c.id === clipId
            ? { ...c, status: "error" as const, error: errorMsg }
            : c
        )
      );
    } finally {
      setIsGenerating(false);
    }
  }, [prompt, xaiApiKey, buildFullPrompt, duration, aspectRatio, resolution, inputImage, inputImagePath, activeProject, useLastFrame]);

  const handleClipClick = useCallback((clipId: string) => {
    stopPlayback();
    setActiveClipId(clipId);
    setGlobalTime(getClipStartTime(clipId));
  }, [getClipStartTime]);

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

  // Start sequential playback from current globalTime
  const startPlayback = useCallback(() => {
    if (playableClips.length === 0) return;

    isPlayingRef.current = true;
    setIsPlaying(true);

    // Find which clip to start from
    const target = getClipAtTime(globalTime);
    if (!target) {
      // Past end — restart from beginning
      setGlobalTime(0);
      setActiveClipId(playableClips[0]?.id ?? null);
      // Will be picked up on next render
      return;
    }

    if (activeClipId !== target.clip.id) {
      setActiveClipId(target.clip.id);
    }

    // The video element will be set by React render; we start tracking in rAF
    let lastTimestamp: number | null = null;

    const tick = (timestamp: number) => {
      if (!isPlayingRef.current) return;

      if (lastTimestamp === null) lastTimestamp = timestamp;
      const delta = (timestamp - lastTimestamp) / 1000;
      lastTimestamp = timestamp;

      setGlobalTime((prev) => {
        const next = prev + delta;
        const totalPlayable = playableClips.reduce((s, c) => s + c.duration, 0);
        if (next >= totalPlayable) {
          // End of all clips — stop
          isPlayingRef.current = false;
          setIsPlaying(false);
          return totalPlayable;
        }
        return next;
      });

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [playableClips, globalTime, activeClipId, getClipAtTime]);

  // Sync video element when globalTime changes during playback
  useEffect(() => {
    if (!isPlayingRef.current) return;

    const target = getClipAtTime(globalTime);
    if (!target) {
      stopPlayback();
      return;
    }

    // Switch clip if needed
    if (activeClipId !== target.clip.id) {
      setActiveClipId(target.clip.id);
    }

    // Sync video element currentTime
    const video = videoRef.current;
    if (video && video.src && activeClipId === target.clip.id) {
      // Only seek if drift is > 0.5s (avoid constant seeking)
      if (Math.abs(video.currentTime - target.localTime) > 0.5) {
        video.currentTime = target.localTime;
      }
      if (video.paused) video.play().catch(() => {});
    }
  }, [globalTime, activeClipId, getClipAtTime, stopPlayback]);

  // When active clip changes during playback, start playing the new video
  useEffect(() => {
    if (!isPlayingRef.current) return;
    const video = videoRef.current;
    if (!video) return;

    const handleCanPlay = () => {
      if (isPlayingRef.current) {
        const target = getClipAtTime(globalTime);
        if (target) video.currentTime = target.localTime;
        video.play().catch(() => {});
      }
    };

    video.addEventListener("canplay", handleCanPlay, { once: true });
    return () => video.removeEventListener("canplay", handleCanPlay);
  }, [activeClipId, getClipAtTime, globalTime]);

  // Cleanup rAF on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

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

  // Handle click on the timeline scrubber bar
  const handleTimelineScrub = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const track = timelineTrackRef.current;
    if (!track || totalDuration === 0) return;

    const rect = track.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, x / rect.width));
    const playableDuration = playableClips.reduce((s, c) => s + c.duration, 0);
    seekTo(ratio * playableDuration);
  }, [totalDuration, playableClips, seekTo]);

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
      {/* Top left controls */}
      <div className="absolute top-3 left-3 z-50 flex items-center gap-1.5">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-neutral-400 hover:text-neutral-200 bg-neutral-900/80 backdrop-blur-sm rounded-lg border border-neutral-800 hover:border-neutral-700 transition-all"
        >
          <ArrowLeftIcon className="w-3.5 h-3.5" />
          Back
        </button>
        <button
          onClick={handleNewScenario}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-neutral-400 hover:text-neutral-200 bg-neutral-900/80 backdrop-blur-sm rounded-lg border border-neutral-800 hover:border-neutral-700 transition-all"
        >
          <PlusIcon className="w-3.5 h-3.5" />
          New
        </button>
      </div>

      {/* Main 3-column area */}
      <div className="flex-1 flex min-h-0">
        {/* ================================================================ */}
        {/* LEFT PANEL - Input Photo */}
        {/* ================================================================ */}
        <div className="w-[350px] flex-shrink-0 bg-neutral-900 border-r border-neutral-800 flex flex-col">
          <div className="px-3 py-3 border-b border-neutral-800">
            <span className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
              Input
            </span>
          </div>

          <div className="flex-1 p-3 flex flex-col min-h-0">
            {inputImage ? (
              <div className="flex-1 flex flex-col min-h-0">
                <div className="flex-1 min-h-0 relative">
                  <img
                    src={inputImage}
                    alt="Input"
                    className="absolute inset-0 w-full h-full object-cover rounded-lg"
                  />
                </div>
                <button
                  onClick={() => { setInputImage(null); setInputImagePath(null); }}
                  className="mt-2 w-full py-1.5 text-xs text-neutral-500 hover:text-neutral-300 border border-neutral-800 hover:border-neutral-700 rounded-md transition-colors flex-shrink-0"
                >
                  Clear
                </button>
              </div>
            ) : (
              <div
                className="flex-1 flex flex-col items-center justify-center rounded-xl cursor-pointer transition-colors bg-neutral-800/30"
                style={{ aspectRatio: "9/16" }}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
              >
                <div className="border-2 border-dashed border-neutral-700 hover:border-neutral-600 rounded-xl w-full h-full flex flex-col items-center justify-center transition-colors">
                  <ArrowUpTrayIcon className="w-8 h-8 text-neutral-600 mb-2" />
                  <span className="text-xs text-neutral-500">
                    Drop image here
                  </span>
                  <span className="text-[10px] text-neutral-600 mt-1">
                    or click to upload
                  </span>
                </div>
              </div>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="hidden"
          />
        </div>

        {/* ================================================================ */}
        {/* CENTER PANEL - Video Preview */}
        {/* ================================================================ */}
        <div className="flex-1 flex flex-col items-center justify-center bg-neutral-950 min-h-0 relative">
          {isGenerating ? (
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 border-2 border-neutral-700 border-t-blue-500 rounded-full animate-spin" />
              <span className="text-sm text-neutral-400">Generating video...</span>
              <span className="text-[10px] text-neutral-600">This may take a few minutes</span>
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
              <div className="flex-1 min-h-0 flex items-center justify-center">
                <div className="relative group cursor-pointer" onClick={togglePlayback}>
                  <video
                    ref={videoRef}
                    src={activeClip.videoSrc}
                    className="max-h-[calc(100vh-280px)] object-contain rounded-lg"
                    style={{ aspectRatio: aspectRatio.replace(":", "/") }}
                    playsInline
                    muted={false}
                  />
                  {/* Play/Pause overlay */}
                  {!isPlaying && (
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="w-14 h-14 bg-black/60 rounded-full flex items-center justify-center backdrop-blur-sm">
                        <PlayIconSolid className="w-6 h-6 text-white ml-0.5" />
                      </div>
                    </div>
                  )}
                </div>
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
                  className="max-h-[calc(100vh-280px)] object-contain rounded-lg"
                  style={{ aspectRatio: aspectRatio.replace(":", "/") }}
                />
              </div>
              <div className="text-xs text-neutral-500">
                Clip {clips.findIndex((c) => c.id === activeClip.id) + 1} /{" "}
                {activeClip.duration}s / Grok Video
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
          <div className="p-3 border-b border-neutral-800">
            <label className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-2 block">
              Prompt
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the scene..."
              className="w-full h-[100px] bg-neutral-800 border border-neutral-700 rounded-lg p-2.5 text-xs text-neutral-200 placeholder:text-neutral-600 resize-none focus:outline-none focus:border-neutral-600 transition-colors"
            />
          </div>

          {/* Evasion */}
          <div className="p-3 border-b border-neutral-800">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
                Evasion
              </label>
              <button
                onClick={() => setEvasionEnabled(!evasionEnabled)}
                className={`relative w-8 h-[18px] rounded-full transition-colors ${
                  evasionEnabled ? "bg-blue-600" : "bg-neutral-700"
                }`}
              >
                <div
                  className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-transform ${
                    evasionEnabled ? "left-[16px]" : "left-[2px]"
                  }`}
                />
              </button>
            </div>

            {evasionEnabled && (
              <div className="space-y-2">
                <select
                  value={evasionTechnique}
                  onChange={(e) =>
                    setEvasionTechnique(e.target.value as EvasionTechnique)
                  }
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-md px-2 py-1.5 text-xs text-neutral-300 focus:outline-none"
                >
                  <option value="context-framing">Context Framing</option>
                  <option value="role-play">Role Play</option>
                  <option value="metaphor">Metaphor</option>
                </select>
                <div className="bg-neutral-800/50 rounded-md p-2 text-[10px] text-neutral-500 italic leading-relaxed">
                  Auto-generated anti-frame prompt will appear here based on your
                  selected technique...
                </div>
              </div>
            )}
          </div>

          {/* Language / Translation */}
          <div className="p-3 border-b border-neutral-800">
            <label className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-2 block">
              Language
            </label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full bg-neutral-800 border border-neutral-700 rounded-md px-2 py-1.5 text-xs text-neutral-300 focus:outline-none"
            >
              {LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.label}
                </option>
              ))}
            </select>
            {language !== "en" && (
              <div className="mt-2 bg-neutral-800/50 rounded-md p-2 text-[10px] text-neutral-500 italic leading-relaxed">
                Translation preview will appear here...
              </div>
            )}
          </div>

          {/* Negative Prompt */}
          <div className="p-3 border-b border-neutral-800">
            <button
              onClick={() => setNegativePromptOpen(!negativePromptOpen)}
              className="flex items-center gap-1.5 text-xs font-medium text-neutral-400 uppercase tracking-wider hover:text-neutral-300 transition-colors"
            >
              <ChevronRightIcon
                className={`w-3 h-3 transition-transform ${
                  negativePromptOpen ? "rotate-90" : ""
                }`}
              />
              Negative Prompt
            </button>
            {negativePromptOpen && (
              <textarea
                value={negativePrompt}
                onChange={(e) => setNegativePrompt(e.target.value)}
                placeholder="What to avoid..."
                className="mt-2 w-full h-[60px] bg-neutral-800 border border-neutral-700 rounded-lg p-2.5 text-xs text-neutral-200 placeholder:text-neutral-600 resize-none focus:outline-none focus:border-neutral-600 transition-colors"
              />
            )}
          </div>

          {/* Style Modifiers */}
          <div className="p-3 border-b border-neutral-800">
            <label className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-2 block">
              Style
            </label>
            <div className="flex flex-wrap gap-1.5">
              {STYLE_TAGS.map((tag) => (
                <button
                  key={tag}
                  onClick={() => handleToggleTag(tag)}
                  className={`px-2 py-1 rounded-md text-[10px] font-medium transition-colors ${
                    activeTags.has(tag)
                      ? "bg-blue-600/30 text-blue-400 border border-blue-500/40"
                      : "bg-neutral-800 text-neutral-500 border border-neutral-700 hover:border-neutral-600 hover:text-neutral-400"
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* Parameters */}
          <div className="p-3 border-b border-neutral-800">
            <label className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-3 block">
              Parameters
            </label>
            <div className="space-y-3">
              {/* Duration */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-neutral-500">Duration</span>
                  <span className="text-[10px] text-neutral-300 font-medium tabular-nums">
                    {duration}s
                  </span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={15}
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className="w-full h-1 bg-neutral-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500"
                />
              </div>

              {/* Aspect Ratio */}
              <div>
                <span className="text-[10px] text-neutral-500 mb-1 block">
                  Aspect Ratio
                </span>
                <div className="flex gap-1">
                  {["9:16", "16:9", "1:1"].map((ar) => (
                    <button
                      key={ar}
                      onClick={() => setAspectRatio(ar)}
                      className={`flex-1 py-1.5 rounded-md text-[10px] font-medium transition-colors ${
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

              {/* Resolution */}
              <div>
                <span className="text-[10px] text-neutral-500 mb-1 block">
                  Resolution
                </span>
                <div className="flex gap-1">
                  {["480p", "720p"].map((res) => (
                    <button
                      key={res}
                      onClick={() => setResolution(res)}
                      className={`flex-1 py-1.5 rounded-md text-[10px] font-medium transition-colors ${
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

          {/* Generate */}
          <div className="p-3 mt-auto">
            {/* Use last frame */}
            <label className="flex items-center gap-2 mb-3 cursor-pointer">
              <input
                type="checkbox"
                checked={useLastFrame}
                onChange={(e) => setUseLastFrame(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-neutral-600 bg-neutral-800 text-blue-500 focus:ring-0 focus:ring-offset-0"
              />
              <span className="text-[10px] text-neutral-400">
                Use last frame as input
              </span>
            </label>

            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 disabled:cursor-not-allowed rounded-lg text-sm font-medium text-white flex items-center justify-center gap-2 transition-colors"
            >
              {isGenerating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Generating...
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
      <div className="h-[140px] flex-shrink-0 bg-neutral-900 border-t border-neutral-800 flex flex-col">
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
          <div className="flex-1" />
          <div className="flex items-center gap-1">
            <button className="text-neutral-500 hover:text-neutral-300 transition-colors">
              <MagnifyingGlassMinusIcon className="w-3.5 h-3.5" />
            </button>
            <button className="text-neutral-500 hover:text-neutral-300 transition-colors">
              <MagnifyingGlassPlusIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Clip track with playhead */}
        <div
          ref={timelineTrackRef}
          className="flex-1 px-3 py-2 relative cursor-pointer"
          onClick={handleTimelineScrub}
        >
          {clips.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <span className="text-[10px] text-neutral-600">
                Timeline empty — generate your first clip
              </span>
            </div>
          ) : (
            <div className="h-full flex items-center gap-0.5">
              {clips.map((clip, index) => {
                const widthPercent = totalDuration > 0 ? (clip.duration / totalDuration) * 100 : 0;
                return (
                  <button
                    key={clip.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleClipClick(clip.id);
                    }}
                    className={`h-[70px] rounded-md overflow-hidden border-2 transition-colors relative group flex-shrink-0 ${
                      activeClipId === clip.id
                        ? "border-blue-500"
                        : clip.status === "error"
                          ? "border-red-500/50"
                          : "border-neutral-700 hover:border-neutral-600"
                    }`}
                    style={{ width: `${Math.max(widthPercent, 3)}%` }}
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
                  </button>
                );
              })}
              {/* Add clip button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleGenerate();
                }}
                disabled={isGenerating}
                className="flex-shrink-0 h-[70px] w-[40px] rounded-md border-2 border-dashed border-neutral-700 hover:border-neutral-600 flex items-center justify-center transition-colors"
              >
                <PlusIcon className="w-4 h-4 text-neutral-600" />
              </button>

              {/* Playhead */}
              {totalDuration > 0 && (
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-blue-500 pointer-events-none z-10"
                  style={{
                    left: `calc(${(globalTime / totalDuration) * 100}% + 12px)`, // 12px = px-3 padding
                  }}
                >
                  {/* Playhead knob */}
                  <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-blue-500 rounded-full shadow-sm" />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Scrubber bar / time axis */}
        <div className="h-[20px] px-3 border-t border-neutral-800/50">
          {totalDuration > 0 ? (
            <div
              className="h-full relative cursor-pointer"
              onClick={handleTimelineScrub}
            >
              {/* Progress fill */}
              <div
                className="absolute top-0 left-0 bottom-0 bg-blue-600/20 rounded-sm"
                style={{ width: `${(globalTime / totalDuration) * 100}%` }}
              />
              {/* Time labels */}
              <div className="absolute inset-0 flex items-center">
                {Array.from({ length: Math.ceil(totalDuration) + 1 }).map(
                  (_, i) => (
                    <div
                      key={i}
                      className="flex-shrink-0"
                      style={{ width: `${(1 / totalDuration) * 100}%` }}
                    >
                      {i % 5 === 0 && (
                        <span className="text-[8px] text-neutral-600 tabular-nums">
                          {i}s
                        </span>
                      )}
                    </div>
                  )
                )}
              </div>
            </div>
          ) : (
            <div className="h-full" />
          )}
        </div>
      </div>
    </div>
  );
}
