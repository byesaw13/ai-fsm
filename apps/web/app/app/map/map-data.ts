/** Owner system map. Update a node's "there" text in the same change that changes that step. */

import workItems from "./work-items.json";

export type MapRecord = { name: string; holds: string };

export type WorkStatus = "asked" | "idea" | "progress" | "backlog" | "deferred";

export type WorkItem = {
  id: string;
  title: string;
  branch: string;
  status: WorkStatus;
  phase: string;
  fit: string;
};

export type MapNode = {
  id: string;
  label: string;
  kind: "branch" | "lens" | "floor";
  step: number | null;
  intended: string;
  built: string;
  records: MapRecord[];
  screenHref: string;
  screenLabel: string;
};

export const WORK: WorkItem[] = workItems as WorkItem[];

export const BRANCHES: MapNode[] = [
  {
    id: "request",
    label: "Request",
    kind: "branch",
    step: 1,
    intended: "The message a homeowner or agent sends before anything is scheduled.",
    built: "The public form stores that message. It does not create a person, a house, a quote, or a job. There is no place to attach photos.",
    records: [{ name: "booking_requests", holds: "Category, description, contact, address, and whether they agreed to texts." }],
    screenHref: "/app/requests",
    screenLabel: "Open Requests",
  },
  {
    id: "person",
    label: "Person",
    kind: "branch",
    step: 2,
    intended: "Who we talk to, how they want to be reached, and who can open the customer page.",
    built: "Accepting a request creates the person. The screen says People. The customer can later change phone and email from a link, with no password.",
    records: [{ name: "clients", holds: "Name, phone, email, preferred contact, and text consent." }],
    screenHref: "/app/clients",
    screenLabel: "Open People",
  },
  {
    id: "house",
    label: "House",
    kind: "branch",
    step: 3,
    intended: "The home the work belongs to. Visits, photos, quotes, and bills attach here.",
    built: "Accepting a request creates the house with the person. The screen says Houses. The address is the record that lasts.",
    records: [
      { name: "properties", holds: "The address and which person we serve there." },
      { name: "property_issues", holds: "Things noticed more than once, still being watched." },
    ],
    screenHref: "/app/properties",
    screenLabel: "Open Houses",
  },
  {
    id: "quote",
    label: "Quote",
    kind: "branch",
    step: 4,
    intended: "A clear price for the agreed work, approved by the customer before the job starts.",
    built: "Prepare Quote on the assessment turns the walkthrough into a draft: work by room, measured quantities, starting hours and questions. Rooms can list only the walls being painted, areas left unpainted and a vaulted peak; wall painting hours come from your pace and paint from the area. Ceilings, trim and drywall patching each use their own method (rate or price book), and each task says which and what is missing. It opens as one row per room with labor, materials and what still needs you; open a room to adjust its tasks, or answer its questions and type a note, and Revise shows what would change and why before you keep it. Itemize materials lists what each room needs, priced from your saved materials first, and Apply sends that list to the job's buy list. You choose T&M or a fixed price, see the modeled profit, then Apply to quote. The customer opens a link, types their name, and signs. That accepts the quote; on a Good/Better/Best quote they must pick an option, and the deposit follows that option. The job does not follow the pick yet. The final bill copies the chosen option, and its lines add up to its subtotal. Extra work can be drafted in the office. The customer has no link to approve the added price. A suggested price-book line uses the book's price, or says Price needed. A materials line keeps what it cost you apart from the price the customer pays. When that price is higher, the line says how much it was marked up, and handling is not added on top of it. Each labor line keeps its person-hours, or says Hours missing. A flat quote keeps one range on the quote. The customer page does not show those hours. A rental or equipment-use charge is its own line. It is not part of the materials total, and handling is not added on top of it.",
    records: [
      { name: "estimates", holds: "The quote, its status, and its total." },
      { name: "estimate_line_items", holds: "Each priced line, what a materials or equipment line cost, and the person-hours on a labor line." },
      { name: "change_orders", holds: "Added scope after approval. Approved-by is a staff user." },
    ],
    screenHref: "/app/estimates",
    screenLabel: "Open Quotes",
  },
  {
    id: "job",
    label: "Job",
    kind: "branch",
    step: 5,
    intended: "The accepted commitment. The quote, the visits, and the bill hang off this one job.",
    built: "Approving the quote creates the job and a \"Schedule this job\" item, and sends the deposit request with its pay link (Settings can turn that off). The item waits on the deposit when the quote says so, and turns ready to book once the deposit is paid. A work order sits under it for planning. You open the job, then its visits.",
    records: [
      { name: "jobs", holds: "Title, house, person, and where it stands from quoted through invoiced." },
      { name: "work_orders", holds: "The internal plan. Not a screen of its own." },
    ],
    screenHref: "/app/jobs",
    screenLabel: "Open Jobs",
  },
  {
    id: "visit",
    label: "Visit",
    kind: "branch",
    step: 6,
    intended: "The day at that house. Show up, do the work, record it, and leave the next action obvious.",
    built: "Today lists the visits. Photos, notes, and materials stay on the visit. A new booking and a reminder can text the customer. Moving the day does not send its own text.",
    records: [
      { name: "visits", holds: "When you are at the house and the status of that stop." },
      { name: "visit_media", holds: "Photos taken on the visit, including before and after." },
    ],
    screenHref: "/app/my-work",
    screenLabel: "Open Today",
  },
  {
    id: "bill",
    label: "Bill",
    kind: "branch",
    step: 7,
    intended: "The charge for the job. The customer can pay by card, and the receipt stays.",
    built: "The bill is for the job. Converted from a quote, it shows the approved lines, including only the chosen option on a Good/Better/Best quote, and those lines add up to the subtotal. An equipment line on the quote stays an equipment line on the bill. The customer opens a link and pays. What is still owed also shows on their home page.",
    records: [
      { name: "invoices", holds: "The bill, its total, and what has been paid." },
      { name: "payments", holds: "Each payment against that bill." },
    ],
    screenHref: "/app/invoices",
    screenLabel: "Open Bills",
  },
  {
    id: "history",
    label: "House history",
    kind: "branch",
    step: 8,
    intended: "After the job, the customer gets a report they can keep, and the house remembers the work.",
    built: "You can publish a Job Report and text or email the link. Publishing is a step you take. It does not happen by itself. One page for the whole house is not built.",
    records: [
      { name: "portal_job_updates", holds: "The published report and the share link." },
      { name: "property_vault_items", holds: "Paint, models, filters, and the other details kept on the house." },
    ],
    screenHref: "/app/jobs",
    screenLabel: "Open Jobs",
  },
];

export const LENSES: MapNode[] = [
  {
    id: "today",
    label: "Today",
    kind: "lens",
    step: null,
    intended: "You are standing on a visit. The screen answers what to do at this house, then the next one.",
    built: "Today reads the visit. It does not create a second kind of job. Work for the day sits on the Visit bubble.",
    records: [{ name: "visits", holds: "Same visit record as the Visit branch." }],
    screenHref: "/app/my-work",
    screenLabel: "Open Today",
  },
  {
    id: "desk",
    label: "Desk",
    kind: "lens",
    step: null,
    intended: "You are in the office. The screen answers what money is open and what is happening tomorrow.",
    built: "Desk reads requests and bills. It is a view of those bubbles, not a new one.",
    records: [
      { name: "invoices", holds: "Open balances, read from the Bill branch." },
      { name: "booking_requests", holds: "New requests, read from the Request branch." },
    ],
    screenHref: "/app",
    screenLabel: "Open Desk",
  },
  {
    id: "customer",
    label: "Customer page",
    kind: "lens",
    step: null,
    intended: "The customer stands on their own house, quotes, bills, and reports. They sign in with a link, not a password.",
    built: "The page shows the same records. It does not keep a separate copy.",
    records: [
      { name: "estimates", holds: "Quotes they can approve." },
      { name: "invoices", holds: "Bills they can pay." },
      { name: "portal_job_updates", holds: "Reports published to them." },
    ],
    screenHref: "/portal/login",
    screenLabel: "Open customer sign-in",
  },
];

export const FLOOR: MapNode = {
  id: "floor",
  label: "Under the floor",
  kind: "floor",
  step: null,
  intended: "Plumbing the customer never sees: security, backups, and the tools that keep the app standing.",
  built: "This is not a step of a job. Work here is listed so it is not invisible, and so it is not mistaken for a new product surface.",
  records: [],
  screenHref: "/app/settings",
  screenLabel: "Open Settings",
};

export const EDGES: { from: string; to: string; label: string; meaning: string }[] = [
  { from: "request", to: "person", label: "creates", meaning: "Accepting the request creates the person. The form by itself does not." },
  { from: "request", to: "house", label: "creates", meaning: "Accepting the request creates the house. The form by itself does not." },
  { from: "house", to: "quote", label: "priced on", meaning: "The price is for work at that house." },
  { from: "quote", to: "job", label: "approves", meaning: "The customer approving the quote creates the job." },
  { from: "job", to: "visit", label: "scheduled as", meaning: "The job gets a day at the house." },
  { from: "visit", to: "bill", label: "charged on", meaning: "The bill is for the job, and it follows the visit." },
  { from: "visit", to: "history", label: "written into", meaning: "What happened on the visit is what the house remembers." },
  { from: "bill", to: "history", label: "kept on", meaning: "The bill and the receipt stay with the house." },
];

export const LENS_LIGHTS: Record<string, string[]> = {
  today: ["visit"],
  desk: ["request", "bill"],
  customer: ["house", "quote", "bill", "history"],
};

export const ALL_NODES: MapNode[] = [...BRANCHES, ...LENSES, FLOOR];

export const STATUS_LABEL: Record<WorkStatus, string> = {
  asked: "You asked",
  idea: "Idea",
  progress: "In the works",
  backlog: "Backlog",
  deferred: "Deferred",
};
