"use client";

import Shell from "@/components/Shell";
import ProfileAppHeader from "@/components/profile/ProfileAppHeader";
import GlobalSearchButton from "@/components/GlobalSearchButton";
import FriendsFeedPanel from "@/components/friends/FriendsFeedPanel";

export default function FriendsPage() {
  return (
    <Shell
      showHeader={false}
      immersive
      topBar={<ProfileAppHeader actions={<GlobalSearchButton />} />}
    >
      <div className="flex h-full min-h-0 select-none touch-manipulation flex-col overflow-hidden">
        <FriendsFeedPanel />
      </div>
    </Shell>
  );
}
