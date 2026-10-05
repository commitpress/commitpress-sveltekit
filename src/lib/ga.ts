import { browser } from "$app/environment";
import { env } from "$env/dynamic/public";

const GA_ID = env.PUBLIC_GA_MEASUREMENT_ID;

// Initialize Google Analytics scripts
export function initGA() {
  if (!browser || !GA_ID) return;

  // Add the script tag to the document head
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://googletagmanager.com{GA_ID}`;
  document.head.appendChild(script);

  // Initialize the dataLayer
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () {
    window.dataLayer.push(arguments);
  };

  window.gtag("js", new Date());
  window.gtag("config", GA_ID);
}

// Log page views manually on route changes
export function trackPageView(path: string) {
  if (!browser || !window.gtag || !GA_ID) return;

  window.gtag("config", GA_ID, {
    page_path: path,
  });
}
