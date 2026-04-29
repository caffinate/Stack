import { createNotionTask } from "@/lib/notion";

export async function POST(request) {
  try {
    const task = await request.json();
    const result = await createNotionTask(task);
    return Response.json(result);
  } catch (error) {
    console.error("Failed to create task:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
