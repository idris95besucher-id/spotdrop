import { collectionStaticParams } from "@/lib/capacitorStaticExport";
import CollectionView from "./CollectionView";

export function generateStaticParams() {
  return collectionStaticParams();
}

export default function CollectionPage() {
  return <CollectionView />;
}
