# **Master Specification: "Second Brain" AI OS (Graph Architecture)**

## **1\. System Architecture & Tech Stack**

* **Framework:** Next.js 14+ (App Router), TypeScript.  
* **UI/Styling:** Tailwind CSS, shadcn/ui, Lucide Icons.  
* **Editor/Input:** TipTap (Rich Text Editor required for @mention functionality).  
* **State & AI:** Vercel AI SDK (useChat, useObject), Zustand (for global state between panes).  
* **Database:** Supabase (PostgreSQL) with pgvector for similarity search. Supabase Auth.  
* **AI Provider:** Google Gemini 1.5 Pro via AI SDK (Free Tier for Dev).  
* **Web Scraping/Tools:** Vercel AI SDK Tools (allowing Gemini to call external APIs or scrape URLs provided by the user).

## **2\. Graph Database Schema (Supabase PostgreSQL)**

### **nodes (The Hierarchy & Logic)**

* id: UUID (PK)  
* user\_id: UUID (FK \-\> auth.users)  
* parent\_id: UUID (FK \-\> nodes.id, nullable)  
* title: String (e.g., "LinkedIn", "Diet")  
* node\_level: Enum ('account', 'domain', 'project', 'task')  
* system\_prompt: Text (Auto-generated AI persona for this tab)  
* core\_summary: Text (Continuously updated summary)  
* status: Enum ('onboarding', 'active') \- Tracks if the AI still needs initial context.

### **node\_links (The Cross-Links)**

* id: UUID (PK)  
* source\_node\_id: UUID  
* target\_node\_id: UUID  
* relationship\_context: String (Why these are linked)  
* priority\_weight: Integer (1-10) \- User-defined slider for context importance.

### **context\_memory (The Vector RAG)**

* id: UUID (PK)  
* node\_id: UUID (FK \-\> nodes.id)  
* content: Text  
* embedding: Vector(768)  
* is\_starred: Boolean (Overrides RAG, always loads into prompt)

## **3\. UI/UX Architecture (The 4-Pane Layout)**

* **Left Sidebar:** A visual tree/graph view of the nodes (Account \-\> Career \-\> LinkedIn).  
* **Main Content Area (Grid Layout):**  
  * **Pane 1 (Top Left) \- Context:** Displays core\_summary, linked nodes (with priority sliders), and ingested files/API data.  
  * **Pane 2 (Bottom Left) \- Ask:** The TipTap editor. Supports standard chat, image/video upload, and explicitly typing @ to trigger a dropdown to hard-reference other nodes.  
  * **Pane 3 (Top Right) \- Questions (Active Acquisition):** On day 1 of a new node, this instantly populates with onboarding questions (e.g., "Paste your URL"). Later, it asks proactive questions to fill context gaps.  
  * **Pane 4 (Bottom Right) \- Plan:** The living document/roadmap. Automatically updated via structured JSON outputs from the LLM.

## **4\. Required Folder Structure (Next.js App Router)**

/src  
  /app  
    /api  
      /chat/route.ts       (Standard chat, context gathering, and Tool calling for web scraping)  
      /architect/route.ts  (Generates system prompts, initial onboarding questions, and suggests links)  
    /dashboard  
      page.tsx             (Main 4-pane layout)  
      layout.tsx           (Sidebar wrapper)  
  /components  
    /ui                    (shadcn components)  
    /editor                (TipTap Ask pane with @mentions)  
    /panes                 (ContextPane, AskPane, QuestionPane, PlanPane)  
    /sidebar               (GraphTree component)  
  /lib  
    /supabase              (Client & Admin setup)  
    /store                 (Zustand state management)

## **5\. Cursor Implementation Guide (Step-by-Step)**

*Do NOT ask Cursor to build this all at once. Copy and paste these phases one by one into Cursor Composer (Cmd+I).*

**PHASE 1: Database & Foundation**

"Read second\_brain\_prd.md. Connect to Supabase via MCP. Execute SQL to create the nodes, node\_links, and context\_memory tables with pgvector enabled. Ensure RLS policies allow a user to access only their own data. Initialize a Next.js App Router project with Tailwind and install shadcn/ui."

**PHASE 2: The UI Shell & State**

"Create the global Zustand store in src/lib/store to manage the currently selected node\_id. Build the layout shell in src/app/dashboard. Include a Left Sidebar and a CSS Grid for the 4 Panes layout (Context, Ask, Questions, Plan). Use dummy data for the panes."

**PHASE 3: The @Mention Editor**

"Install TipTap. Build the AskPane component. Implement a custom TipTap extension that triggers a dropdown menu when the user types @. The dropdown should fetch nodes from Supabase. When selected, insert a visual tag into the editor."

**PHASE 4: AI Context & Graph RAG**

"Implement api/chat/route.ts using Vercel AI SDK and Gemini 1.5 Pro. Logic: If an @ mention exists, pull that node's data. Check node\_links for any connected nodes with a priority\_weight \> 7 and inject their summaries into the system prompt."

**PHASE 5: Active Onboarding & Web Scraping**

"Implement api/architect/route.ts. When a new node is created, this route must do two things: 1\) Generate the system\_prompt. 2\) Return an array of 3 'Onboarding Questions' to immediately populate the Questions Pane. Add an AI SDK 'tool' in the chat route that allows Gemini to fetch/scrape a URL if the user pastes one in response."