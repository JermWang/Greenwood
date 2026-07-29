'use client';

// Site-wide sound: a global click cue plus the mute toggle.
//
// Rather than wire a sound into every button, one delegated listener plays the
// generic "tap" for any button or link press across the app. Richer cues
// (success, error, claim, deploy…) are fired explicitly at the moments that
// deserve them. Mounted once, in the app layout and the landing page.

import { useEffect } from 'react';
import { SpeakerHigh, SpeakerSlash } from '@phosphor-icons/react';
import { playSfx, useSfx } from '@/lib/sfx';

export default function SoundToggle() {
  const muted = useSfx((s) => s.muted);
  const toggleMuted = useSfx((s) => s.toggleMuted);

  useEffect(() => {
    // One delegated listener covers the whole app. pointerdown (not click) so
    // the cue lands the instant the control is pressed, matching the feel of a
    // physical button.
    const onDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      const control = target?.closest('button, a, [role="button"]');
      if (!control) return;
      // The mute button plays its own confirmation; a tap on top would double up.
      if (control.hasAttribute('data-sfx-skip')) return;
      // Disabled controls do nothing, so they should sound like nothing.
      if (control instanceof HTMLButtonElement && control.disabled) return;
      playSfx('tap');
    };
    window.addEventListener('pointerdown', onDown, { passive: true });
    return () => window.removeEventListener('pointerdown', onDown);
  }, []);

  return (
    <button
      type="button"
      data-sfx-skip
      onClick={toggleMuted}
      aria-pressed={muted}
      aria-label={muted ? 'Unmute sound effects' : 'Mute sound effects'}
      title={muted ? 'Sound off' : 'Sound on'}
      className="gw-icon-button !h-[42px] !w-[42px] hover:border-lime-300/30 hover:text-lime-300"
    >
      {muted ? <SpeakerSlash size={16} weight="duotone" /> : <SpeakerHigh size={16} weight="duotone" />}
    </button>
  );
}
