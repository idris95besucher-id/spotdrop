import { usernameStaticParams } from "@/lib/capacitorStaticExport";
import UsernameRedirectView from "./UsernameRedirectView";

export function generateStaticParams() {
  return usernameStaticParams();
}

export default function UsernameRedirectPage() {
  return <UsernameRedirectView />;
}
