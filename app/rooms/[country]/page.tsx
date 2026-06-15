import { countryStaticParams } from "@/lib/capacitorStaticExport";
import CountryRoomsView from "./CountryRoomsView";

export function generateStaticParams() {
  return countryStaticParams();
}

export default function CountryRoomsPage() {
  return <CountryRoomsView />;
}
