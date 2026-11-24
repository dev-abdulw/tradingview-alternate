import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";
import { themes } from "@/ui/tokens/tokens";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE.title,
    short_name: SITE.name,
    description: SITE.description,
    start_url: "/",
    display: "standalone",
    background_color: themes.dark["bg-app"],
    theme_color: themes.dark["bg-app"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
