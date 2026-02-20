/**
 * SHARP API Route
 *
 * Two modes:
 * 1. Predict: base64 image → SHARP CLI → .ply (cached) + rendered view
 * 2. Re-render: plyId + angle → rendered view at new angle (no prediction)
 *
 * The .ply is cached server-side with source image dimensions.
 * Re-renders match the original aspect ratio automatically.
 */

import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, readFile, readdir, mkdir, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { storePly, getPlyEntry } from "@/lib/ply/store";

const execFileAsync = promisify(execFile);

const SHARP_TIMEOUT = 600_000; // 10 minutes (first run downloads 2.6GB model)
const RENDER_MAX_DIM = 1024; // max dimension for rendered output

export const dynamic = "force-dynamic";
export const maxDuration = 600; // 10 minutes

interface SharpRequest {
  image?: string; // base64 data URL (predict mode)
  plyId?: string; // cached .ply ID (re-render mode)
  angle?: number; // Y-axis rotation in degrees
}

interface SharpResponse {
  success: boolean;
  plyId?: string;
  renderedView?: string;
  error?: string;
}

function getSharpCmd(): string {
  return process.env.SHARP_PATH || "sharp";
}

async function isSharpInstalled(): Promise<boolean> {
  try {
    await execFileAsync(getSharpCmd(), ["--help"], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

async function findFileWithExtension(
  dir: string,
  ext: string
): Promise<string | null> {
  try {
    const files = await readdir(dir);
    const match = files.find((f) => f.endsWith(ext));
    return match ? join(dir, match) : null;
  } catch {
    return null;
  }
}

/**
 * Compute render dimensions that match the source aspect ratio,
 * fitting within RENDER_MAX_DIM on the longest side.
 */
function computeRenderDims(srcWidth: number, srcHeight: number): { w: number; h: number } {
  const aspect = srcWidth / srcHeight;
  if (srcWidth >= srcHeight) {
    return { w: RENDER_MAX_DIM, h: Math.round(RENDER_MAX_DIM / aspect) };
  }
  return { w: Math.round(RENDER_MAX_DIM * aspect), h: RENDER_MAX_DIM };
}

/**
 * Detect image dimensions from a buffer using Python/PIL.
 */
async function detectImageDimensions(
  imagePath: string
): Promise<{ width: number; height: number }> {
  try {
    const sharpCmd = getSharpCmd();
    const pythonPath = sharpCmd.replace(/\/sharp$/, "/python");
    const { stdout } = await execFileAsync(
      pythonPath,
      ["-c", `from PIL import Image; img=Image.open("${imagePath}"); print(img.width, img.height)`],
      { timeout: 10_000 }
    );
    const [w, h] = stdout.trim().split(/\s+/).map(Number);
    if (w > 0 && h > 0) return { width: w, height: h };
  } catch {
    // Fall through to default
  }
  return { width: 1024, height: 1024 };
}

/**
 * Render a .ply file at a given angle using the Python fallback renderer.
 */
async function renderPlyAtAngle(
  plyPath: string,
  renderDir: string,
  angle: number,
  requestId: string,
  width: number,
  height: number,
): Promise<string | undefined> {
  try {
    const renderOutputPath = join(renderDir, "render.png");
    const sharpCmd = getSharpCmd();
    const pythonPath = sharpCmd.replace(/\/sharp$/, "/python");
    const scriptPath = join(process.cwd(), "scripts", "render_ply.py");

    await execFileAsync(
      pythonPath,
      [scriptPath, plyPath, renderOutputPath, String(width), String(height), String(angle)],
      { timeout: 120_000 }
    );

    const renderBuffer = await readFile(renderOutputPath);
    console.log(`[SHARP:${requestId}] Render complete (${width}x${height}, angle=${angle})`);
    return `data:image/png;base64,${renderBuffer.toString("base64")}`;
  } catch (err) {
    console.log(
      `[SHARP:${requestId}] Render failed:`,
      err instanceof Error ? err.message : err
    );
    return undefined;
  }
}

export async function POST(request: NextRequest): Promise<NextResponse<SharpResponse>> {
  const requestId = Math.random().toString(36).substring(7);
  const workDir = join(tmpdir(), `sharp-${requestId}-${Date.now()}`);

  try {
    const body = (await request.json()) as SharpRequest;
    const angle = body.angle ?? 0;

    // ── Re-render mode: cached plyId + angle ──
    if (body.plyId) {
      const entry = getPlyEntry(body.plyId);
      if (!entry) {
        return NextResponse.json(
          { success: false, error: "PLY cache expired. Run the node again to regenerate." },
          { status: 404 }
        );
      }

      const { w, h } = computeRenderDims(entry.width, entry.height);
      console.log(`[SHARP:${requestId}] Re-render (plyId=${body.plyId.substring(0, 8)}, ${w}x${h}, angle=${angle})`);

      const renderDir = join(workDir, "render");
      await mkdir(renderDir, { recursive: true });

      const plyPath = join(workDir, "cached.ply");
      await writeFile(plyPath, entry.data);

      const renderedView = await renderPlyAtAngle(plyPath, renderDir, angle, requestId, w, h);

      return NextResponse.json({
        success: true,
        plyId: body.plyId,
        renderedView,
      });
    }

    // ── Predict mode: image → SHARP → .ply + render ──
    if (!body.image) {
      return NextResponse.json(
        { success: false, error: "No image or plyId provided" },
        { status: 400 }
      );
    }

    const installed = await isSharpInstalled();
    if (!installed) {
      return NextResponse.json(
        {
          success: false,
          error:
            "SHARP CLI not found. Install it with: conda create -n sharp python=3.13 && pip install -r requirements.txt (from the ml-sharp repo)",
        },
        { status: 503 }
      );
    }

    const matches = body.image.match(/^data:(.+?);base64,(.+)$/);
    if (!matches) {
      return NextResponse.json(
        { success: false, error: "Invalid image format. Expected base64 data URL." },
        { status: 400 }
      );
    }

    const mimeType = matches[1];
    const base64Data = matches[2];
    const ext = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg";

    const inputDir = join(workDir, "input");
    const outputDir = join(workDir, "output");
    const renderDir = join(workDir, "render");

    await mkdir(inputDir, { recursive: true });
    await mkdir(outputDir, { recursive: true });
    await mkdir(renderDir, { recursive: true });

    // Write input image and detect its dimensions
    const inputPath = join(inputDir, `input.${ext}`);
    await writeFile(inputPath, Buffer.from(base64Data, "base64"));

    const imgDims = await detectImageDimensions(inputPath);
    const { w: renderW, h: renderH } = computeRenderDims(imgDims.width, imgDims.height);
    console.log(`[SHARP:${requestId}] Input: ${imgDims.width}x${imgDims.height}, render: ${renderW}x${renderH}`);

    console.log(`[SHARP:${requestId}] Running prediction...`);

    const sharpCmd = getSharpCmd();
    const predictArgs = ["predict", "-i", inputDir, "-o", outputDir];

    if (process.env.SHARP_CHECKPOINT) {
      predictArgs.push("-c", process.env.SHARP_CHECKPOINT);
    }

    await execFileAsync(sharpCmd, predictArgs, { timeout: SHARP_TIMEOUT });

    const plyPath = await findFileWithExtension(outputDir, ".ply");
    if (!plyPath) {
      return NextResponse.json(
        { success: false, error: "SHARP completed but no .ply file was generated" },
        { status: 500 }
      );
    }

    console.log(`[SHARP:${requestId}] Prediction complete, caching .ply`);

    const plyBuffer = await readFile(plyPath);
    const plyId = storePly(plyBuffer, imgDims.width, imgDims.height);

    // Render preview
    let renderedView: string | undefined;

    // Try SHARP native renderer (CUDA only)
    try {
      console.log(`[SHARP:${requestId}] Attempting SHARP render...`);
      await execFileAsync(
        sharpCmd,
        ["render", "-i", outputDir, "-o", renderDir],
        { timeout: SHARP_TIMEOUT }
      );

      const renderedFiles = await readdir(renderDir);
      const imageFile = renderedFiles.find(
        (f) => f.endsWith(".png") || f.endsWith(".jpg") || f.endsWith(".jpeg")
      );

      if (imageFile) {
        const renderBuffer = await readFile(join(renderDir, imageFile));
        const renderExt = imageFile.endsWith(".png") ? "png" : "jpeg";
        renderedView = `data:image/${renderExt};base64,${renderBuffer.toString("base64")}`;
        console.log(`[SHARP:${requestId}] SHARP render complete`);
      }
    } catch {
      console.log(`[SHARP:${requestId}] SHARP render unavailable, using fallback...`);
    }

    // Fallback: Python renderer at correct aspect ratio
    if (!renderedView) {
      renderedView = await renderPlyAtAngle(plyPath, renderDir, angle, requestId, renderW, renderH);
    }

    return NextResponse.json({
      success: true,
      plyId,
      renderedView,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "SHARP processing failed";
    console.error(`[SHARP:${requestId}] Error:`, message);

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  } finally {
    try {
      await rm(workDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}
