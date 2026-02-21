import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs/promises";
import * as path from "path";

const STATE_FILENAME = "scenario.json";

// POST: Save scenario state to a project directory
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { directoryPath, state } = body;

    if (!directoryPath || !state) {
      return NextResponse.json(
        { success: false, error: "Missing directoryPath or state" },
        { status: 400 }
      );
    }

    // Ensure directory exists
    await fs.mkdir(directoryPath, { recursive: true });

    await fs.writeFile(
      path.join(directoryPath, STATE_FILENAME),
      JSON.stringify(state, null, 2)
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Save failed" },
      { status: 500 }
    );
  }
}

// GET: Load scenario state from a project directory
export async function GET(request: NextRequest) {
  try {
    const directoryPath = request.nextUrl.searchParams.get("path");
    if (!directoryPath) {
      return NextResponse.json(
        { success: false, error: "Missing path parameter" },
        { status: 400 }
      );
    }

    const filePath = path.join(directoryPath, STATE_FILENAME);
    try {
      const data = await fs.readFile(filePath, "utf-8");
      return NextResponse.json({ success: true, state: JSON.parse(data) });
    } catch {
      return NextResponse.json({ success: true, state: null });
    }
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Load failed" },
      { status: 500 }
    );
  }
}
