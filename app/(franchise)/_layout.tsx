import { Stack } from "expo-router";
import React from "react";
import RoleGuard from "@/components/RoleGuard";

export default function FranchiseLayout() {
  return (
    <RoleGuard requiredRole="FRANCHISE">
      <Stack screenOptions={{ headerShown: false }} />
    </RoleGuard>
  );
}
