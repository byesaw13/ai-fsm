import { BookingClient } from "./BookingClient";

export const dynamic = "force-dynamic";

// Public choices match the marketing site. Keep existing IDs so request routing
// and historical price-book categories retain their current meaning.
const SERVICE_CATEGORIES = [
  { id: "painting_finishes", label: "Painting & drywall", icon: "🎨", description: "Interior walls, ceilings, trim, and drywall repairs" },
  { id: "general_repairs", label: "Repairs", icon: "🔧", description: "Doors, trim, caulking, hardware, and small repairs" },
  { id: "mounting_installs", label: "Mounting & installations", icon: "📺", description: "TVs, shelves, mirrors, window treatments, and furniture assembly" },
  { id: "maintenance_small", label: "Maintenance", icon: "🛠️", description: "Tailored seasonal checks, weatherproofing, and preventive repairs" },
  { id: "carpentry_furniture", label: "Custom woodworking", icon: "🪚", description: "Shelving, trim, woodwork repairs, and pieces made to fit" },
];

export default function BookingPage() {
  return <BookingClient serviceCategories={SERVICE_CATEGORIES} />;
}
