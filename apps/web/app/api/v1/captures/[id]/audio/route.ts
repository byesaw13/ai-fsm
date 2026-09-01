/**
 * GET /api/v1/captures/[id]/audio — serve the immutable original audio.
 */
import { serveCaptureOriginal } from "../../serve-original";

export const dynamic = "force-dynamic";

export const GET = serveCaptureOriginal("audio");
