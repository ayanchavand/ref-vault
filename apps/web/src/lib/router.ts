import { useState, useEffect } from "react";

export type Route =
  | { view: "SELECT_LIBRARY" }
  | { view: "BROWSE_LIBRARY" }
  | { view: "BROWSE_TAGS" }
  | { view: "BROWSE_MEDIA" }
  | { view: "VIEW_VIDEO"; path: string }
  | { view: "IMPORT_VIDEO" };

function parseHash(hash: string): Route {
  // Strip leading '#'
  const path = hash.startsWith("#") ? hash.slice(1) : hash;

  if (path === "" || path === "/") {
    return { view: "BROWSE_LIBRARY" };
  }

  if (path === "/tags") {
    return { view: "BROWSE_TAGS" };
  }

  if (path === "/media") {
    return { view: "BROWSE_MEDIA" };
  }

  if (path === "/import") {
    return { view: "IMPORT_VIDEO" };
  }

  if (path.startsWith("/video")) {
    const queryIndex = path.indexOf("?");
    if (queryIndex !== -1) {
      const searchParams = new URLSearchParams(path.slice(queryIndex));
      const videoPath = searchParams.get("path");
      if (videoPath) {
        return { view: "VIEW_VIDEO", path: videoPath };
      }
    }
  }

  return { view: "BROWSE_LIBRARY" };
}

export function navigate(route: Route) {
  let hash = "#/";
  if (route.view === "BROWSE_TAGS") {
    hash = "#/tags";
  } else if (route.view === "BROWSE_MEDIA") {
    hash = "#/media";
  } else if (route.view === "IMPORT_VIDEO") {
    hash = "#/import";
  } else if (route.view === "VIEW_VIDEO") {
    hash = `#/video?path=${encodeURIComponent(route.path)}`;
  }
  window.location.hash = hash;
}

export function useHashRouter(hasActiveLibrary: boolean): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));

  useEffect(() => {
    const handleHashChange = () => {
      setRoute(parseHash(window.location.hash));
    };

    window.addEventListener("hashchange", handleHashChange);
    return () => {
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, []);

  // Override view if library is not validated yet (unless browsing independent media)
  if (!hasActiveLibrary && route.view !== "BROWSE_MEDIA") {
    return { view: "SELECT_LIBRARY" };
  }

  return route;
}
