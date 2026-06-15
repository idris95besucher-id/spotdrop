import { dmUserStaticParams } from "@/lib/capacitorStaticExport";
import DmThreadView from "./DmThreadView";

export function generateStaticParams() {
  return dmUserStaticParams();
}

export default function DmThreadPage() {
  return <DmThreadView />;
}
