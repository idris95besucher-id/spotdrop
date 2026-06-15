import { cityStaticParams } from "@/lib/capacitorStaticExport";
import CityRoomView from "./CityRoomView";

export function generateStaticParams() {
  return cityStaticParams();
}

export default function CityRoomPage() {
  return <CityRoomView />;
}
