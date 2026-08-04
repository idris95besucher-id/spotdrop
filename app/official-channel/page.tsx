import { Suspense } from "react";
import OfficialChannelView from "./OfficialChannelView";

export default function OfficialChannelPage() {
  return (
    <Suspense fallback={null}>
      <OfficialChannelView />
    </Suspense>
  );
}
