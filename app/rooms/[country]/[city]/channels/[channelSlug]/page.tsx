import { channelStaticParams } from "@/lib/capacitorStaticExport";
import ChannelView from "./ChannelView";

export async function generateStaticParams() {
  return channelStaticParams();
}

export default function ChannelPage() {
  return <ChannelView />;
}
