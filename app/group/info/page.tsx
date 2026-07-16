import { Suspense } from "react";
import GroupInfoView from "./GroupInfoView";

export default function GroupInfoPage() {
  return (
    <Suspense>
      <GroupInfoView />
    </Suspense>
  );
}
