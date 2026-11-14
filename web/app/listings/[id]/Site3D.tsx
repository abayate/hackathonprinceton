"use client";

import dynamic from "next/dynamic";
import type { Pin } from "@/app/components/Viewer3D";

const Viewer3D = dynamic(() => import("@/app/components/Viewer3D"), { ssr: false });

export default function Site3D({ pin }: { pin: Pin }) {
  return <Viewer3D pins={[pin]} focusId={pin.id} />;
}
