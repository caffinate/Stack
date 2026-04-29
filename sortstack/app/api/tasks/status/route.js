import { updateTaskStatus } from "@/lib/notion";

export async function PATCH(request) {
  try {
    const { pageId, sourceId, status } = await request.json();
    await updateTaskStatus(pageId, sourceId, status);
    return Response.json({ success: true });
  } catch (error) {
    console.error("Failed to update task:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
