# Sort Stack

A digital card-sorting task manager modeled on the physical index card GTD system. Built with Next.js, deployed on Vercel, backed by Notion.

---

## Setup

### 1. Create a Notion Integration

1. Go to [notion.so/my-integrations](https://www.notion.so/my-integrations)
2. Click **New integration**
3. Name it "Sort Stack", select your workspace
4. Copy the **Internal Integration Secret** (starts with `secret_`)

### 2. Share your databases with the integration

In Notion, open each database:
- **Sort Stack Tasks** (Personal / Sightbox)
- **Team Thompson Tasks**

Click the `...` menu → **Connections** → add your Sort Stack integration.

### 3. Configure environment variables

Copy `.env.local` and fill in your values:

```bash
cp .env.local .env.local
```

```
NOTION_API_KEY=secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
SORT_STACK_DB_ID=caf72c3b-340c-4d6f-b623-e9cc31fefdc3
THOMPSON_DB_ID=319b26df-5467-8072-a3cf-000b880e958d
```

### 4. Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Deploy to Vercel

### Option A — Vercel CLI

```bash
npm i -g vercel
vercel
```

Follow the prompts. When asked about environment variables, add your three keys.

### Option B — GitHub + Vercel Dashboard

1. Push this folder to a GitHub repo
2. Go to [vercel.com](https://vercel.com) → **New Project** → import the repo
3. Under **Environment Variables**, add:
   - `NOTION_API_KEY`
   - `SORT_STACK_DB_ID`
   - `THOMPSON_DB_ID`
4. Click **Deploy**

Your app will be live at `https://sort-stack-xxxx.vercel.app`

### Add to iPhone home screen

1. Open the Vercel URL in Safari
2. Tap the **Share** button → **Add to Home Screen**
3. Sort Stack installs as a full-screen app with no browser chrome

---

## Adding a new Notion database source

Edit `lib/notion.js` and add a new entry to the `SOURCES` array:

```js
{
  id: "my-source",           // unique key
  name: "My Source",         // display name
  icon: "📋",                // emoji shown in filter pills
  dbId: process.env.MY_DB_ID,
  fieldMap: {
    title:    "Task Name",   // Notion property name for the title
    status:   "Status",      // status/select property
    taskType: "Priority",    // maps to Normal/Urgent/Intention
    category: "Category",
    workspace: null,         // null = use source name as workspace
    notes:    "Notes",
    due:      "Due Date",
  },
  statusIn: {
    stack: ["Backlog", "Not Started"],
    today: ["In Progress"],
    done:  ["Done"],
  },
  statusOut: {
    today:   { Status: { select: { name: "In Progress" } } },
    skipped: null,
    done:    { Status: { select: { name: "Done" } } },
    stack:   { Status: { select: { name: "Not Started" } } },
  },
}
```

Then add `MY_DB_ID` to your `.env.local` and Vercel environment variables.

---

## Database schemas

### Sort Stack Tasks (Personal / Sightbox)
| Property  | Type   | Values |
|-----------|--------|--------|
| Title     | title  | — |
| Workspace | select | Personal, Sightbox |
| Category  | select | Client Task, Sightbox Task |
| Type      | select | Normal, Urgent, Intention |
| Status    | select | stack, today, skipped, done |
| Notes     | text   | — |
| Due Date  | date   | — |

### Team Thompson Tasks
Uses existing database schema — no changes needed. Sort Stack reads `Name`, `Status`, `Priority`, `Category`, `Notes`, `Due Date`, `Assignee`.

---

## Architecture

```
app/
  page.js              ← Server component: fetches tasks from Notion on each request
  layout.js            ← Root layout, PWA meta tags
  api/
    tasks/route.js          ← GET /api/tasks — refresh all tasks
    tasks/status/route.js   ← PATCH /api/tasks/status — update status
    tasks/create/route.js   ← POST /api/tasks/create — create new task

components/
  SortStackApp.jsx     ← Full client-side app (all views, gestures, state)

lib/
  notion.js            ← Notion API client, source configs, data mapping
```

Tasks are fetched server-side on page load (fast, no client auth needed). Status updates and creates happen via API routes. The Notion API key never touches the client.
