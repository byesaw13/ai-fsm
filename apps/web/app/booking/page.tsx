import { BookingClient } from "./BookingClient";

export const dynamic = "force-dynamic";

const SERVICE_CATEGORIES = [
  { id: "painting_finishes", label: "Painting & Finishes", icon: "🎨", description: "Interior/exterior painting, staining, wallpaper" },
  { id: "general_repairs", label: "General Repairs", icon: "🔧", description: "Drywall, door/window repair, fixture fixes" },
  { id: "plumbing", label: "Plumbing", icon: "🚿", description: "Leak repairs, faucet/toilet replacement, drain clearing" },
  { id: "electrical", label: "Electrical", icon: "⚡", description: "Outlet/switch replacement, light fixture installs" },
  { id: "carpentry_furniture", label: "Carpentry & Furniture", icon: "🪚", description: "Shelving, trim work, furniture assembly" },
  { id: "mounting_installs", label: "Mounting & Installs", icon: "📺", description: "TV mounting, shelves, curtain rods, hardware" },
  { id: "outdoor_seasonal", label: "Outdoor & Seasonal", icon: "🏡", description: "Deck/fence repair, gutter cleaning, seasonal prep" },
  { id: "maintenance_small", label: "Maintenance & Small Jobs", icon: "🛠️", description: "General upkeep, minor fixes, handyman tasks" },
  { id: "specialty_expansion", label: "Specialty Projects", icon: "✨", description: "Custom work, renovations, unique projects" },
];

export default function BookingPage() {
  return <BookingClient serviceCategories={SERVICE_CATEGORIES} />;
}
