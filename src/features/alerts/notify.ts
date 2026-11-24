import { useSettings } from "@/features/settings/settings-store";
import { toast } from "@/ui/toast";

/**
 * One way to tell the user something happened (price alert, signal flip):
 * a toast with an action, a browser notification when permitted, and the
 * optional chime.
 */
export function notify({
  title,
  body,
  tag,
  actionLabel,
  onAction,
}: {
  title: string;
  body: string;
  tag: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  toast.warning(title, {
    description: body,
    duration: 15_000,
    ...(actionLabel && onAction ? { action: { label: actionLabel, onClick: onAction } } : {}),
  });
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    try {
      const n = new Notification(title, { body, tag });
      n.onclick = () => {
        window.focus();
        onAction?.();
      };
    } catch {
      /* some browsers only allow notifications from a service worker */
    }
  }
  if (useSettings.getState().alertSound) chime();
}

/** Two short soft tones, synthesized (no audio asset to load). */
function chime() {
  try {
    const ctx = new AudioContext();
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t0 = ctx.currentTime + i * 0.16;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.12, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.15);
    });
    setTimeout(() => void ctx.close(), 600);
  } catch {
    /* audio blocked until a user gesture — the toast and notification still fire */
  }
}

/** Ask once, on a user gesture (creating an alert). */
export function requestNotificationPermission() {
  if (typeof Notification !== "undefined" && Notification.permission === "default") {
    void Notification.requestPermission();
  }
}
