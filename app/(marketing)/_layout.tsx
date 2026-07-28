import { Stack } from "expo-router";
import React from "react";
import RoleGuard from "@/components/RoleGuard";

export default function MarketingLayout() {
  return (
    <RoleGuard requiredRole="MARKETING">
      <Stack screenOptions={{ headerShown: false }} />
    </RoleGuard>
  );
}
