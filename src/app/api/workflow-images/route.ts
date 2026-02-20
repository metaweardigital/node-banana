import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs/promises";
import * as path from "path";
import { logger } from "@/utils/logger";

export const maxDuration = 300; // 5 minute timeout for large image operations

const IMAGES_FOLDER = "inputs";
const LEGACY_IMAGES_FOLDER = ".images"; // For backward compatibility

// POST: Save an image to the workflow's inputs or generations folder
export async function POST(request: NextRequest) {
  let workflowPath: string | undefined;
  let imageId: string | undefined;
  let folder: string | undefined;
  try {
    const body = await request.json();
    workflowPath = body.workflowPath;
    imageId = body.imageId;
    folder = body.folder || IMAGES_FOLDER; // Default to "inputs"
    const imageData = body.imageData; // Base64 data URL

    // Validate folder is one of the allowed values
    if (folder !== IMAGES_FOLDER && folder !== "generations") {
      folder = IMAGES_FOLDER;
    }

    logger.info('file.save', 'Workflow image save request received', {
      workflowPath,
      imageId,
      folder,
      hasImageData: !!imageData,
    });

    if (!workflowPath || !imageId || !imageData) {
      logger.warn('file.save', 'Workflow image save validation failed: missing fields', {
        hasWorkflowPath: !!workflowPath,
        hasImageId: !!imageId,
        hasImageData: !!imageData,
      });
      return NextResponse.json(
        { success: false, error: "Missing required fields (workflowPath, imageId, imageData)" },
        { status: 400 }
      );
    }

    // Validate workflow directory exists
    try {
      const stats = await fs.stat(workflowPath);
      if (!stats.isDirectory()) {
        logger.warn('file.error', 'Workflow image save failed: path is not a directory', {
          workflowPath,
        });
        return NextResponse.json(
          { success: false, error: "Workflow path is not a directory" },
          { status: 400 }
        );
      }
    } catch (dirError) {
      logger.warn('file.error', 'Workflow image save failed: directory does not exist', {
        workflowPath,
      });
      return NextResponse.json(
        { success: false, error: "Workflow directory does not exist" },
        { status: 400 }
      );
    }

    // Create target folder if it doesn't exist
    const targetFolder = path.join(workflowPath, folder);
    try {
      await fs.mkdir(targetFolder, { recursive: true });
    } catch (mkdirError) {
      logger.error('file.error', 'Failed to create target folder', {
        targetFolder,
      }, mkdirError instanceof Error ? mkdirError : undefined);
      return NextResponse.json(
        { success: false, error: "Failed to create target folder" },
        { status: 500 }
      );
    }

    // Skip save if a file with this ID already exists (any extension)
    // This prevents duplicates when save-generation already saved e.g. .jpg
    const SAVE_EXTENSIONS = ["png", "jpg", "jpeg", "webp"];
    for (const existingExt of SAVE_EXTENSIONS) {
      try {
        await fs.access(path.join(targetFolder, `${imageId}.${existingExt}`));
        logger.info('file.save', 'Image already exists, skipping save', { imageId, existingExt });
        return NextResponse.json({ success: true, imageId, filePath: path.join(targetFolder, `${imageId}.${existingExt}`) });
      } catch {
        // Not found with this extension, continue
      }
    }

    // Detect file extension from data URL MIME type (default to png)
    const mimeMatch = imageData.match(/^data:image\/(\w+);base64,/);
    const mimeExt = mimeMatch?.[1];
    const ext = mimeExt === "jpeg" || mimeExt === "jpg" ? "jpg"
      : mimeExt === "webp" ? "webp"
      : "png";
    const filename = `${imageId}.${ext}`;
    const filePath = path.join(targetFolder, filename);

    // Extract base64 data and convert to buffer
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");

    // Write the image file
    await fs.writeFile(filePath, buffer);

    logger.info('file.save', 'Workflow image saved successfully', {
      filePath,
      imageId,
      fileSize: buffer.length,
    });

    return NextResponse.json({
      success: true,
      imageId,
      filePath,
    });
  } catch (error) {
    logger.error('file.error', 'Failed to save workflow image', {
      workflowPath,
      imageId,
    }, error instanceof Error ? error : undefined);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Save failed",
      },
      { status: 500 }
    );
  }
}

// GET: Load an image from the workflow's folders (inputs, generations, or legacy .images)
export async function GET(request: NextRequest) {
  const workflowPath = request.nextUrl.searchParams.get("workflowPath");
  const imageId = request.nextUrl.searchParams.get("imageId");
  const folder = request.nextUrl.searchParams.get("folder"); // Optional hint for which folder to check first

  logger.info('file.load', 'Workflow image load request received', {
    workflowPath,
    imageId,
    folder,
  });

  if (!workflowPath || !imageId) {
    logger.warn('file.load', 'Workflow image load validation failed: missing parameters', {
      hasWorkflowPath: !!workflowPath,
      hasImageId: !!imageId,
    });
    return NextResponse.json(
      { success: false, error: "Missing required parameters (workflowPath, imageId)" },
      { status: 400 }
    );
  }

  try {
    // Validate workflow directory exists
    try {
      const stats = await fs.stat(workflowPath);
      if (!stats.isDirectory()) {
        return NextResponse.json(
          { success: false, error: "Workflow path is not a directory" },
          { status: 400 }
        );
      }
    } catch {
      return NextResponse.json(
        { success: false, error: "Workflow directory does not exist" },
        { status: 400 }
      );
    }

    // Construct file path - check folders in order based on hint
    const EXTENSIONS = ["png", "jpg", "jpeg", "webp"];
    const inputsFolder = path.join(workflowPath, IMAGES_FOLDER);
    const generationsFolder = path.join(workflowPath, "generations");
    const legacyFolder = path.join(workflowPath, LEGACY_IMAGES_FOLDER);

    // Build search order based on folder hint
    const searchOrder = folder === "generations"
      ? [generationsFolder, inputsFolder, legacyFolder]
      : [inputsFolder, generationsFolder, legacyFolder];

    let filePath: string | null = null;

    // Check each folder and extension combination
    for (const searchFolder of searchOrder) {
      for (const ext of EXTENSIONS) {
        const candidatePath = path.join(searchFolder, `${imageId}.${ext}`);
        try {
          await fs.access(candidatePath);
          filePath = candidatePath;
          if (searchFolder === legacyFolder) {
            logger.info('file.load', 'Found image in legacy .images folder', { filePath });
          }
          break;
        } catch {
          // File not found with this extension, try next
        }
      }
      if (filePath) break;
    }

    if (!filePath) {
      // Return 200 with success: false to avoid Next.js error overlay
      // Missing files are expected when workflow refs point to deleted/moved images
      logger.info('file.load', 'Workflow image not found (expected for missing refs)', {
        imageId,
        searchedFolders: searchOrder,
      });
      return NextResponse.json({
        success: false,
        error: "Image file not found",
        notFound: true,
      });
    }

    // Read the image file
    const buffer = await fs.readFile(filePath);

    // Determine MIME type from actual file extension
    const fileExt = path.extname(filePath).slice(1).toLowerCase();
    const mimeType = fileExt === "jpg" || fileExt === "jpeg" ? "image/jpeg"
      : fileExt === "webp" ? "image/webp"
      : "image/png";
    const base64 = buffer.toString("base64");
    const dataUrl = `data:${mimeType};base64,${base64}`;

    logger.info('file.load', 'Workflow image loaded successfully', {
      filePath,
      imageId,
      fileSize: buffer.length,
    });

    return NextResponse.json({
      success: true,
      imageId,
      image: dataUrl,
    });
  } catch (error) {
    logger.error('file.error', 'Failed to load workflow image', {
      workflowPath,
      imageId,
    }, error instanceof Error ? error : undefined);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Load failed",
      },
      { status: 500 }
    );
  }
}
