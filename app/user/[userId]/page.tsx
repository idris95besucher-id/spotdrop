import { publicUserStaticParams } from "@/lib/capacitorStaticExport";
import UserProfileView from "./UserProfileView";

export function generateStaticParams() {
  return publicUserStaticParams();
}

export default function UserProfilePage() {
  return <UserProfileView />;
}
