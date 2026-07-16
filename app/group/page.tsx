import { Suspense } from "react";
import GroupThreadView from "./GroupThreadView";

export default function GroupThreadPage() {
  return (
    <Suspense>
      <GroupThreadView />
    </Suspense>
  );
}
