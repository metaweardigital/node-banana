import { NextResponse } from "next/server";

export interface EnvStatusResponse {
  gemini: boolean;
  openai: boolean;
  replicate: boolean;
  fal: boolean;
  kie: boolean;
  wavespeed: boolean;
  xai: boolean;
  bfl: boolean;
  comfyui: boolean;
  local: boolean;
}

export async function GET() {
  // Check which API keys are configured via environment variables
  const status: EnvStatusResponse = {
    gemini: !!process.env.GEMINI_API_KEY,
    openai: !!process.env.OPENAI_API_KEY,
    replicate: !!process.env.REPLICATE_API_KEY,
    fal: !!process.env.FAL_API_KEY,
    kie: !!process.env.KIE_API_KEY,
    wavespeed: !!process.env.WAVESPEED_API_KEY,
    xai: !!process.env.XAI_API_KEY,
    bfl: !!process.env.BFL_API_KEY,
    comfyui: false, // ComfyUI is configured via UI (server URL), not env var
    local: !!process.env.LOCAL_LLM_URL,
  };

  return NextResponse.json(status);
}
