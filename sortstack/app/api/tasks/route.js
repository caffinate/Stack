import { fetchAllTasks } from "@/lib/notion";

export async function GET() {
  try {
    const tasks = await fetchAllTasks();
    return Response.json({ tasks });
  } catch (error) {
    console.error("Failed to fetch tasks:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
