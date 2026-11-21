import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

// LOOPA is a browser-only WebGL app (three.js, IndexedDB, window APIs),
// so it is loaded lazily and rendered only after hydration.
const LoopaApp = lazy(() => import("@/loopa/App"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "LOOPA — Modelador 3D Táctil" },
      {
        name: "description",
        content:
          "LOOPA es un modelador 3D interactivo para iPad y navegador con modos Objeto y Edición, topología editable de vértices, aristas y caras, y visor WebGL.",
      },
      { property: "og:title", content: "LOOPA — Modelador 3D Táctil" },
      {
        property: "og:description",
        content:
          "Modelador 3D táctil para iPad y navegador con topología editable real de vértices, aristas y caras.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function LoadingScreen() {
  return <div className="loopa-loading" aria-label="Cargando LOOPA" />;
}

function Index() {
  return (
    <ClientOnly fallback={<LoadingScreen />}>
      <Suspense fallback={<LoadingScreen />}>
        <LoopaApp />
      </Suspense>
    </ClientOnly>
  );
}
