import { Client } from "@notionhq/client";

const notion = new Client({ auth: process.env.NOTION_API_KEY });

// ── Source configs ─────────────────────────────────────────────────────────────
export const SOURCES = [
  {
    id: "sort-stack",
    name: "Personal / Sightbox",
    icon: "🗂",
    dbId: process.env.SORT_STACK_DB_ID,
    fieldMap: {
      title: "Title",
      status: "Status",
      taskType: "Type",
      category: "Category",
      workspace: "Workspace",
      notes: "Notes",
      due: "Due Date",
    },
    statusIn: {
      stack: ["stack", "skipped"],
      today: ["today"],
      done: ["done"],
    },
    statusOut: {
      today: { Status: { select: { name: "today" } } },
      skipped: { Status: { select: { name: "skipped" } } },
      done: { Status: { select: { name: "done" } } },
      stack: { Status: { select: { name: "stack" } } },
    },
  },
  {
    id: "thompson",
    name: "Team Thompson",
    icon: "🏠",
    dbId: process.env.THOMPSON_DB_ID,
    fieldMap: {
      title: "Name",
      status: "Status",
      taskType: "Priority",
      category: "Category",
      workspace: null,
      notes: "Notes",
      due: "Due Date",
    },
    statusIn: {
      stack: ["Not Started", "Waiting", "Blocked"],
      today: ["In Progress"],
      done: ["Done"],
    },
    statusOut: {
      today: { Status: { status: { name: "In Progress" } } },
      skipped: null, // session-only
      done: {
        Status: { status: { name: "Done" } },
        Complete: { checkbox: true },
      },
      stack: { Status: { status: { name: "Not Started" } } },
    },
    priorityIn: { High: "Urgent", Medium: "Normal", Low: "Intention" },
  },
];

// ── Property extractors ────────────────────────────────────────────────────────
function extractProp(page, name) {
  const prop = page.properties?.[name];
  if (!prop) return "";
  switch (prop.type) {
    case "title": return prop.title?.map((t) => t.plain_text).join("") || "";
    case "rich_text": return prop.rich_text?.map((t) => t.plain_text).join("") || "";
    case "select": return prop.select?.name || "";
    case "status": return prop.status?.name || "";
    case "checkbox": return prop.checkbox ? "__YES__" : "__NO__";
    case "date": return prop.date?.start || "";
    case "multi_select": return prop.multi_select?.map((s) => s.name).join(", ") || "";
    case "people": return prop.people?.map((p) => p.name).join(", ") || "";
    default: return "";
  }
}

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function pageToTask(page, source) {
  const fm = source.fieldMap;
  const rawStatus = extractProp(page, fm.status);
  const rawType = extractProp(page, fm.taskType);

  let status = "stack";
  for (const [ssStatus, values] of Object.entries(source.statusIn)) {
    if (values.includes(rawStatus)) { status = ssStatus; break; }
  }

  let taskType = source.priorityIn?.[rawType] || rawType || "Normal";
  if (!["Normal", "Urgent", "Intention"].includes(taskType)) taskType = "Normal";

  return {
    id: page.id,
    sourceId: source.id,
    title: extractProp(page, fm.title) || "(untitled)",
    workspace: fm.workspace ? (extractProp(page, fm.workspace) || source.name) : source.name,
    category: extractProp(page, fm.category),
    taskType,
    status,
    notes: extractProp(page, fm.notes),
    assignee: extractProp(page, "Assignee"),
    createdAt: formatDate(page.created_time),
    dueDate: formatDate(extractProp(page, fm.due)),
    notionUrl: page.url,
  };
}

// ── Fetch all tasks from all sources ──────────────────────────────────────────
export async function fetchAllTasks() {
  const results = await Promise.allSettled(
    SOURCES.filter((s) => s.dbId).map(async (source) => {
      const response = await notion.databases.query({
        database_id: source.dbId,
        filter: {
          property: source.fieldMap.status,
          [source.id === "thompson" ? "status" : "select"]: {
            does_not_equal: "Done",
          },
        },
        page_size: 100,
      });
      return response.results.map((page) => pageToTask(page, source));
    })
  );
  return results.flatMap((r) => r.status === "fulfilled" ? r.value : []);
}

// ── Update a task's status in Notion ─────────────────────────────────────────
export async function updateTaskStatus(pageId, sourceId, newStatus) {
  const source = SOURCES.find((s) => s.id === sourceId);
  if (!source) throw new Error(`Unknown source: ${sourceId}`);
  const writes = source.statusOut[newStatus];
  if (!writes) return; // session-only (e.g. Thompson skips)
  await notion.pages.update({ page_id: pageId, properties: writes });
}

// ── Create a new task in Notion ───────────────────────────────────────────────
export async function createNotionTask(task) {
  const source = SOURCES.find((s) => s.id === task.sourceId) || SOURCES[0];
  const fm = source.fieldMap;

  const typeOut = source.priorityIn
    ? Object.entries(source.priorityIn).find(([, v]) => v === task.taskType)?.[0] || "Medium"
    : task.taskType;

  const properties = {
    [fm.title]: { title: [{ text: { content: task.title } }] },
    [fm.taskType]: source.priorityIn
      ? { select: { name: typeOut } }
      : { select: { name: task.taskType } },
    [fm.notes]: { rich_text: [{ text: { content: task.notes || "" } }] },
  };

  if (fm.status && source.statusOut.stack) {
    const stackVal = source.statusOut.stack;
    properties[fm.status] = stackVal[fm.status];
  }
  if (fm.workspace && task.workspace) {
    properties[fm.workspace] = { select: { name: task.workspace } };
  }
  if (fm.category && task.category) {
    properties[fm.category] = { select: { name: task.category } };
  }

  const page = await notion.pages.create({
    parent: { database_id: source.dbId },
    properties,
  });
  return { id: page.id, url: page.url };
}
