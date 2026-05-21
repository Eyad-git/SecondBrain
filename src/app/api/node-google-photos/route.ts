import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const GOOGLE_PHOTOS_SETUP_MESSAGE =
  "Node Google Photos context is not initialized yet. Run db/node_google_photos.sql in your Supabase SQL editor.";

function getMissingTableMessage(message: string): string | null {
  const normalized = message.toLowerCase();
  if (
    normalized.includes("node_google_photos_items") &&
    (normalized.includes("could not find the table") ||
      normalized.includes("relation") ||
      normalized.includes("does not exist"))
  ) {
    return GOOGLE_PHOTOS_SETUP_MESSAGE;
  }
  return null;
}

const googleItemSchema = z.object({
  itemType: z.enum(["album", "photo"]),
  googleItemId: z.string().min(1).max(300),
  title: z.string().max(500).optional().nullable(),
  mediaUrl: z.string().max(2000).optional().nullable(),
  thumbnailUrl: z.string().max(2000).optional().nullable(),
  productUrl: z.string().max(2000).optional().nullable(),
  mimeType: z.string().max(140).optional().nullable(),
  createdTime: z.string().max(120).optional().nullable(),
  cameraMake: z.string().max(180).optional().nullable(),
  cameraModel: z.string().max(180).optional().nullable(),
  payloadJson: z.record(z.string(), z.unknown()).optional().default({}),
});

const createSchema = z.object({
  nodeId: z.string().uuid(),
  items: z.array(googleItemSchema).min(1).max(100),
});

function toNullable(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const nodeId = url.searchParams.get("nodeId");
    if (!nodeId) {
      return NextResponse.json({ error: "nodeId is required." }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("node_google_photos_items")
      .select(
        "id,node_id,item_type,google_item_id,title,media_url,thumbnail_url,product_url,mime_type,created_time,camera_make,camera_model,payload_json,created_at"
      )
      .eq("user_id", user.id)
      .eq("node_id", nodeId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      const setupMessage = getMissingTableMessage(error.message);
      if (setupMessage) {
        return NextResponse.json({
          items: [],
          setupRequired: true,
          setupMessage,
        });
      }
      return NextResponse.json(
        { error: `Could not load Google Photos context: ${error.message}` },
        { status: 400 }
      );
    }

    return NextResponse.json({
      items: (data ?? []).map((row) => ({
        id: String(row.id),
        nodeId: String(row.node_id),
        itemType: row.item_type === "album" ? "album" : "photo",
        googleItemId: String(row.google_item_id),
        title: typeof row.title === "string" ? row.title : null,
        mediaUrl: typeof row.media_url === "string" ? row.media_url : null,
        thumbnailUrl: typeof row.thumbnail_url === "string" ? row.thumbnail_url : null,
        productUrl: typeof row.product_url === "string" ? row.product_url : null,
        mimeType: typeof row.mime_type === "string" ? row.mime_type : null,
        createdTime: typeof row.created_time === "string" ? row.created_time : null,
        cameraMake: typeof row.camera_make === "string" ? row.camera_make : null,
        cameraModel: typeof row.camera_model === "string" ? row.camera_model : null,
        payloadJson:
          row.payload_json && typeof row.payload_json === "object"
            ? (row.payload_json as Record<string, unknown>)
            : {},
        createdAt: typeof row.created_at === "string" ? row.created_at : "",
      })),
    });
  } catch (error) {
    console.error("[api/node-google-photos:get]", error);
    return NextResponse.json(
      { error: "Failed to load node Google Photos context." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = createSchema.parse(await req.json());
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: node } = await supabase
      .from("nodes")
      .select("id,user_id")
      .eq("id", body.nodeId)
      .maybeSingle();
    if (!node || node.user_id !== user.id) {
      return NextResponse.json({ error: "Node not found." }, { status: 404 });
    }

    const rows = body.items.map((item) => ({
      user_id: user.id,
      node_id: body.nodeId,
      item_type: item.itemType,
      google_item_id: item.googleItemId.trim(),
      title: toNullable(item.title),
      media_url: toNullable(item.mediaUrl),
      thumbnail_url: toNullable(item.thumbnailUrl),
      product_url: toNullable(item.productUrl),
      mime_type: toNullable(item.mimeType),
      created_time: toNullable(item.createdTime),
      camera_make: toNullable(item.cameraMake),
      camera_model: toNullable(item.cameraModel),
      payload_json: item.payloadJson ?? {},
    }));

    const { data: inserted, error } = await supabase
      .from("node_google_photos_items")
      .upsert(rows, {
        onConflict: "user_id,node_id,item_type,google_item_id",
        ignoreDuplicates: false,
      })
      .select(
        "id,node_id,item_type,google_item_id,title,media_url,thumbnail_url,product_url,mime_type,created_time,camera_make,camera_model,payload_json,created_at"
      );

    if (error) {
      const setupMessage = getMissingTableMessage(error.message);
      if (setupMessage) {
        return NextResponse.json({ error: setupMessage }, { status: 503 });
      }
      return NextResponse.json(
        { error: `Could not save Google Photos context: ${error.message}` },
        { status: 400 }
      );
    }

    return NextResponse.json({
      items: (inserted ?? []).map((row) => ({
        id: String(row.id),
        nodeId: String(row.node_id),
        itemType: row.item_type === "album" ? "album" : "photo",
        googleItemId: String(row.google_item_id),
        title: typeof row.title === "string" ? row.title : null,
        mediaUrl: typeof row.media_url === "string" ? row.media_url : null,
        thumbnailUrl: typeof row.thumbnail_url === "string" ? row.thumbnail_url : null,
        productUrl: typeof row.product_url === "string" ? row.product_url : null,
        mimeType: typeof row.mime_type === "string" ? row.mime_type : null,
        createdTime: typeof row.created_time === "string" ? row.created_time : null,
        cameraMake: typeof row.camera_make === "string" ? row.camera_make : null,
        cameraModel: typeof row.camera_model === "string" ? row.camera_model : null,
        payloadJson:
          row.payload_json && typeof row.payload_json === "object"
            ? (row.payload_json as Record<string, unknown>)
            : {},
        createdAt: typeof row.created_at === "string" ? row.created_at : "",
      })),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[api/node-google-photos:post]", error);
    return NextResponse.json(
      { error: "Failed to save node Google Photos context." },
      { status: 500 }
    );
  }
}
