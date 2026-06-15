import { postStaticParams } from "@/lib/capacitorStaticExport";
import PostDetailView from "./PostDetailView";

export function generateStaticParams() {
  return postStaticParams();
}

export default function PostDetailPage() {
  return <PostDetailView />;
}
