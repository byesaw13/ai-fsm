/**
 * GET /api/v1/captures/[id]/photo — serve the immutable original photo, if present.
 */
import { serveCaptureOriginal } from "../../serve-original";

export const dynamic = "force-dynamic";

export const GET = serveCaptureOriginal("photo");
