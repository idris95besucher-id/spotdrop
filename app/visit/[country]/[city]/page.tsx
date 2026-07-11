import { Suspense } from "react";
import { cityStaticParams } from "@/lib/capacitorStaticExport";
import CityRoomView from "@/app/rooms/[country]/[city]/CityRoomView";

export async function generateStaticParams() {
  return cityStaticParams();
}

/** Visit city room — public chat for a city (e.g. /visit/switzerland/zurich). */
export default function VisitCityPage() {
  return (
    <Suspense fallback={null}>
      <CityRoomView />
    </Suspense>
  );
}
