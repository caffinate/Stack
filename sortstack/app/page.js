import { fetchAllTasks } from "@/lib/notion";
import SortStackApp from "@/components/SortStackApp";

export const revalidate = 0; // always fresh

export default async function Page() {
  let initialTasks = [];
  try {
    initialTasks = await fetchAllTasks();
  } catch (e) {
    console.error("Initial fetch failed:", e);
  }
  return <SortStackApp initialTasks={initialTasks} />;
}
