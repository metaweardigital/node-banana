import { NextResponse } from "next/server";

// Default to node-banana-pro hosted service
const COMMUNITY_WORKFLOWS_API_URL =
  process.env.COMMUNITY_WORKFLOWS_API_URL ||
  "https://nodebananapro.com/api/public/community-workflows";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET: Load a specific community workflow by ID from the remote API
 *
 * This proxies to the node-banana-pro hosted service which stores
 * community workflows in R2 storage.
 */
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;

    const response = await fetch(`${COMMUNITY_WORKFLOWS_API_URL}/${id}`, {
      headers: {
        Accept: "application/json",
      },
      // Cache for 10 minutes (individual workflows change less frequently)
      next: { revalidate: 600 },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json(
          {
            success: false,
            error: `Workflow not found: ${id}`,
          },
          { status: 404 }
        );
      }

      console.error(
        "Error fetching community workflow:",
        response.status,
        response.statusText
      );
      return NextResponse.json(
        {
          success: false,
          error: "Failed to load workflow",
        },
        { status: response.status }
      );
    }

    const data = await response.json();

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error loading community workflow:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to load workflow",
      },
      { status: 500 }
    );
  }
}
