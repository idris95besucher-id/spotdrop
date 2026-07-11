import { countryStaticParams } from "@/lib/capacitorStaticExport";
import CountryRoomsView from "@/app/rooms/[country]/CountryRoomsView";

export async function generateStaticParams() {
  return countryStaticParams();
}

/** Visit country page — cities list for a country (e.g. /visit/switzerland). */
export default function VisitCountryPage() {
  return <CountryRoomsView />;
}
