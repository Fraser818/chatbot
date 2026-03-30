import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { db } from "@/lib/db";
import { fileAsset } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * GET /api/files/[id]
 * 从 fileAsset 表读取文件并返回
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const file = await db
      .select()
      .from(fileAsset)
      .where(eq(fileAsset.id, id))
      .limit(1);

    if (!file || file.length === 0) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const fileRecord = file[0];

    // 解码 Base64 内容
    const buffer = Buffer.from(fileRecord.content, "base64");

    // 返回文件
    // 处理中文文件名 (RFC 5987 编码)
    const encodedFilename = encodeURIComponent(fileRecord.filename).replace(/['()]/g, escape);

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": fileRecord.mimeType || "application/octet-stream",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodedFilename}`,
      },
    });
  } catch (error) {
    console.error("[File API] Error:", error);
    return NextResponse.json(
      { error: "Failed to get file" },
      { status: 500 }
    );
  }
}
