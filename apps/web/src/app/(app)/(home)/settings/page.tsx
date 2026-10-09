"use client";

import { AppearanceCard } from "@/components/settings/appearance-card";
import { PasswordCard } from "@/components/settings/password-card";
import { ProfileCard } from "@/components/settings/profile-card";
import { SettingsCard } from "@/components/settings/settings-card";

export default function GeneralSettingsPage() {
  return (
    <>
      <ProfileCard />
      <AppearanceCard />
      <PasswordCard />
      <SettingsCard title="Sessions" index={3}>
        <p className="-mt-3 max-w-2xl text-sm text-muted-foreground">
          Sign-ins last 30 days on each device. To end your session sooner, choose Sign out from the user menu in the top bar.
        </p>
      </SettingsCard>
    </>
  );
}
