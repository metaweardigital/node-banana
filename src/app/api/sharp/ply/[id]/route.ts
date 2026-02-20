/**
 * PLY File Serving Endpoint
 *
 * Serves cached .ply files from the in-memory store.
 * Used by the client-side Gaussian splat viewer to load .ply data.
 *
 * GET /api/sharp/ply/[id] - Retrieve stored .ply by ID
 */

import { NextRequest, NextResponse } from "next/server";
import { getPly } from "@/lib/ply/store";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;

  const data = getPly(id);
  if (!data) {
    return NextResponse.json(
      { error: "PLY file not found or expired" },
      { status: 404 }
    );
  }

  return new NextResponse(new Uint8Array(data), {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="sharp-${id.substring(0, 8)}.ply"`,
      "Cache-Control": "no-store",
    },
  });
}
