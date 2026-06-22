import { countryStaticParams } from "@/lib/capacitorStaticExport";
import CountryRoomsView from "./CountryRoomsView";

export async function generateStaticParams() {
  return countryStaticParams();
}

export default function CountryRoomsPage() {
  return <CountryRoomsView />;
}
