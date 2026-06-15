import { profileUserStaticParams } from "@/lib/capacitorStaticExport";
import ProfileRedirectView from "./ProfileRedirectView";

export function generateStaticParams() {
  return profileUserStaticParams();
}

export default function ProfileUserIdRedirectPage() {
  return <ProfileRedirectView />;
}
