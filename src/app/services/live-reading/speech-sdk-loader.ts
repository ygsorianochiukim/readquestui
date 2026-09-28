import type * as SpeechSDK from 'microsoft-cognitiveservices-speech-sdk';

/** The shape of the SDK we use, kept honest by the package's own types. */
export type SpeechSdk = typeof SpeechSDK;

declare global {
  interface Window {
    SpeechSDK?: SpeechSdk;
  }
}

/**
 * Where the browser bundle is served from. It is copied out of the package at
 * build time (see angular.json assets), so it stays in step with the version in
 * package.json rather than being a checked-in copy that quietly goes stale.
 */
const BUNDLE_URL = 'vendor/microsoft.cognitiveservices.speech.sdk.bundle-min.js';

let pending: Promise<SpeechSdk> | null = null;

/**
 * Load the Azure Speech SDK, once, on demand.
 *
 * The npm entry point is built for Node — it reaches for `events`, `url` and
 * a proxy agent, none of which exist in a browser, and bundling it fails. The
 * package ships a browser build for exactly this, but only as a UMD script, so
 * it goes in through a script tag rather than an import.
 *
 * Loading it lazily also keeps a megabyte and a half out of the initial bundle:
 * every teacher screen in the app would otherwise pay for a feature only the
 * reading pages use.
 */
export function loadSpeechSdk(): Promise<SpeechSdk> {
  if (window.SpeechSDK) {
    return Promise.resolve(window.SpeechSDK);
  }

  // Two readers opening at once must not fetch it twice.
  pending ??= new Promise<SpeechSdk>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[data-speech-sdk]`,
    );

    const script = existing ?? document.createElement('script');

    const settle = () => {
      if (window.SpeechSDK) {
        resolve(window.SpeechSDK);
      } else {
        pending = null;
        reject(new Error('The speech library loaded but did not register itself.'));
      }
    };

    script.addEventListener('load', settle, { once: true });
    script.addEventListener(
      'error',
      () => {
        // Let the next attempt try again rather than caching the failure —
        // this is usually a dropped connection in a classroom, not a bad URL.
        pending = null;
        script.remove();
        reject(new Error('Could not load the speech library.'));
      },
      { once: true },
    );

    if (!existing) {
      script.src = BUNDLE_URL;
      script.async = true;
      script.dataset['speechSdk'] = 'true';
      document.head.appendChild(script);
    }
  });

  return pending;
}
