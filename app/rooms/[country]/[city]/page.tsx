import { cityStaticParams } from "@/lib/capacitorStaticExport";
import CityRoomView from "./CityRoomView";

export async function generateStaticParams() {
  return cityStaticParams();
}

export default function CityRoomPage() {
  return <CityRoomView />;
}
