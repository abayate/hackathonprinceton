"use client";

import { useEffect, useRef, useState } from "react";

type Props = { src: string; alt: string; className?: string; fallbackLabel?: string };

export default function PropertyImage({ src, alt, className, fallbackLabel = "Aerial imagery unavailable" }: Props) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    // A server-rendered image may finish failing before hydration attaches onError.
    const image = imageRef.current;
    if (image?.complete && image.naturalWidth === 0) setFailedSrc(src);
  }, [src]);
  const unavailable = !src || failedSrc === src;
  return <div className={className} style={{ position: "relative", overflow: "hidden", background: "#e9ede6" }}>
    {unavailable ? <div role="img" aria-label={`${alt}: unavailable`} style={{ display: "flex", height: "100%", minHeight: 0, alignItems: "center", justifyContent: "center", padding: "4px", color: "#5b6c61", textAlign: "center", fontSize: "10px", lineHeight: 1.25, overflowWrap: "anywhere" }}>
      <span>{fallbackLabel}</span>
    </div> : <img key={src} ref={imageRef} src={src} alt={alt} loading="lazy" onError={() => setFailedSrc(src)} style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }} /> /* eslint-disable-line @next/next/no-img-element */}
  </div>;
}
