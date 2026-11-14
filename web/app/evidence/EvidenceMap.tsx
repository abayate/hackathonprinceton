"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { MapPin } from "@/app/components/PinMap";

const DotMap = dynamic(() => import("./DotMap"), { ssr: false });

export default function EvidenceMap({ points }: { points: MapPin[] }) {
  const router = useRouter();
  return <DotMap points={points} onSelect={(id) => router.push(`/sites/${id}`)} />;
}
