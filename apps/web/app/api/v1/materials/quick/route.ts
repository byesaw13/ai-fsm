import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { generateMaterials, MaterialsGenerationError } from "@/lib/estimates/materials-generator";
import { formatSupplyHouseOrderText } from "@/lib/estimates/quick-materials";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: { message: "Unauthorized" } }, { status: 401 });
  }

  try {
    const body = (await req.json()) as { scope?: string; job_type?: string };
    const scope = body.scope?.trim() ?? "";
    if (!scope) {
      return NextResponse.json(
        { error: { message: "Job scope is required to generate a materials list." } },
        { status: 400 }
      );
    }

    const result = await generateMaterials({
      scope,
      job_type: body.job_type || "general_repair",
    });

    return NextResponse.json({
      ...result,
      order_text: formatSupplyHouseOrderText(scope, result),
    });
  } catch (err) {
    if (err instanceof MaterialsGenerationError) {
      return NextResponse.json({ error: { message: err.message } }, { status: err.status });
    }
    console.error("Failed to generate quick materials list:", err);
    return NextResponse.json(
      { error: { message: "Failed to generate materials list." } },
      { status: 500 }
    );
  }
}
